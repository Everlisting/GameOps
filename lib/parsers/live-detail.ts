/**
 * csvType="live_detail" 解析器 —— 主播直播明细(脚本「所有主播画像表」)。
 *
 * 粒度:主播 × 自然日,一行一天。按 (platform, uid, date) upsert 到 LiveStat。
 *
 * 关键约定:
 *   - **只入库「有效开播时长 > 0」的条目**;没开播的零行(时长=0)直接跳过,不落库。
 *   - UID 取 `UID2` 列去前缀 "UID"(普通 UID 列会被 Excel 转成科学计数法丢精度);缺 UID2 时回退还原 UID。
 *   - 排除两列不入库:直播-游戏流水(分成前)(元)、直播-主播游戏收入(分成后)(元)。
 *   - 表头括号全角/半角都认(先归一)。
 *   - 备注列即团号,存入 note。
 *
 * 手动导入(运营在「直播数据」页上传)与爬虫上报(Job outputs csvType=live_detail)共用本 parser。
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { parseCsv } from "./csv";
import { applyFilterTree } from "./csv-helpers";
import type { Parser } from "./types";

const BATCH_SIZE = 200;

/** 归一表头:全角括号→半角、去空白,便于跨导出源匹配 */
function normHeader(s: string): string {
  return s
    .trim()
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/\s+/g, "");
}

// 逻辑字段 → 可能的表头(归一后)。UID/日期/时长是核心,其余缺列按 0 处理。
const ALIASES = {
  uid2: ["UID2"],
  uid: ["UID"],
  date: ["日期"],
  nickname: ["主播名称", "主播昵称"],
  account: ["主播账号", "抖音号"],
  soundWave: ["音浪(火力)", "音浪", "火力"],
  liveDuration: ["有效开播时长(小时)", "开播时长(小时)", "有效开播时长"],
  exposureUsers: ["曝光人数"],
  exposureCount: ["曝光次数"],
  enterRoomUsers: ["进直播间人数"],
  enterRoomCount: ["进直播间次数"],
  enterRoomRate: ["进直播间转化率"],
  avgWatchDuration: ["人均观看时长(分钟)", "人均观看时长"],
  tipUsers: ["打赏人数"],
  tipCount: ["打赏次数"],
  newFans: ["新增粉丝"],
  acu: ["ACU"],
  operatorAgent: ["运营经纪人"],
  recruitAgent: ["招募经纪人", "招募经济人"],
  note: ["备注", "团号"],
} as const;

type Field = keyof typeof ALIASES;

type LiveRow = {
  platform: string;
  uid: string;
  date: Date;
  nickname: string | null;
  account: string | null;
  soundWave: number;
  liveDuration: number;
  exposureUsers: number;
  exposureCount: number;
  enterRoomUsers: number;
  enterRoomCount: number;
  enterRoomRate: number;
  avgWatchDuration: number;
  tipUsers: number;
  tipCount: number;
  newFans: number;
  acu: number;
  operatorAgent: string | null;
  recruitAgent: string | null;
  note: string | null;
};

export const parseLiveDetail: Parser = async (csv, ctx) => {
  const rows = parseCsv(csv);
  if (rows.length === 0) return { rowCount: 0 };

  // 归一表头 → 下标(重复取最后一次)
  const headerIndex = new Map<string, number>();
  rows[0].forEach((h, i) => headerIndex.set(normHeader(h), i));

  const colOf: Partial<Record<Field, number>> = {};
  for (const field of Object.keys(ALIASES) as Field[]) {
    for (const alias of ALIASES[field]) {
      const norm = normHeader(alias);
      if (headerIndex.has(norm)) colOf[field] = headerIndex.get(norm);
    }
  }

  if (colOf.date === undefined || colOf.liveDuration === undefined) {
    throw new Error(
      `缺少必需列:${colOf.date === undefined ? "日期 " : ""}${colOf.liveDuration === undefined ? "有效开播时长(小时)" : ""};实际表头:${rows[0].join(",")}`,
    );
  }
  if (colOf.uid2 === undefined && colOf.uid === undefined) {
    throw new Error(`缺少 UID 列(UID2 / UID 至少一个);实际表头:${rows[0].join(",")}`);
  }

  const dataRows: LiveRow[] = [];
  let skippedNoLive = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((c) => c.trim() === "")) continue;

    const rowByName: Record<string, string> = {};
    for (const [name, i] of headerIndex.entries()) rowByName[name] = row[i] ?? "";
    if (!applyFilterTree(rowByName, ctx.filterRoot)) continue;

    const cell = (field: Field): string => {
      const i = colOf[field];
      return i === undefined ? "" : (row[i] ?? "").trim();
    };

    // UID:优先 UID2 去前缀,回退还原 UID
    const uid = uidFromUid2(cell("uid2")) ?? normalizeUid(cell("uid"));
    if (!uid) continue;

    const date = parseDateUtc(cell("date"));
    if (!date) continue;

    const liveDuration = parseFloatSafe(cell("liveDuration"));
    // 只入库有效开播(时长 > 0);没开播的零行跳过
    if (!(liveDuration > 0)) {
      skippedNoLive++;
      continue;
    }

    dataRows.push({
      platform: "douyin",
      uid,
      date,
      nickname: nonEmpty(cell("nickname")),
      account: nonEmpty(cell("account")),
      soundWave: parseIntSafe(cell("soundWave")),
      liveDuration,
      exposureUsers: parseIntSafe(cell("exposureUsers")),
      exposureCount: parseIntSafe(cell("exposureCount")),
      enterRoomUsers: parseIntSafe(cell("enterRoomUsers")),
      enterRoomCount: parseIntSafe(cell("enterRoomCount")),
      enterRoomRate: parseFloatSafe(cell("enterRoomRate")),
      avgWatchDuration: parseFloatSafe(cell("avgWatchDuration")),
      tipUsers: parseIntSafe(cell("tipUsers")),
      tipCount: parseIntSafe(cell("tipCount")),
      newFans: parseIntSafe(cell("newFans")),
      acu: parseFloatSafe(cell("acu")),
      operatorAgent: nonEmpty(cell("operatorAgent")),
      recruitAgent: nonEmpty(cell("recruitAgent")),
      note: nonEmpty(cell("note")),
    });
  }

  if (dataRows.length === 0) return { rowCount: 0, skippedCount: skippedNoLive };

  let processed = 0;
  for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
    const batch = dataRows.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(batch.map((r) => buildUpsert(r, ctx.datasetId)));
    processed += batch.length;
  }

  return { rowCount: processed, skippedCount: skippedNoLive };
};

function buildUpsert(r: LiveRow, datasetId: string): Prisma.PrismaPromise<unknown> {
  const shared = {
    nickname: r.nickname,
    account: r.account,
    soundWave: r.soundWave,
    liveDuration: r.liveDuration,
    exposureUsers: r.exposureUsers,
    exposureCount: r.exposureCount,
    enterRoomUsers: r.enterRoomUsers,
    enterRoomCount: r.enterRoomCount,
    enterRoomRate: r.enterRoomRate,
    avgWatchDuration: r.avgWatchDuration,
    tipUsers: r.tipUsers,
    tipCount: r.tipCount,
    newFans: r.newFans,
    acu: r.acu,
    operatorAgent: r.operatorAgent,
    recruitAgent: r.recruitAgent,
    note: r.note,
    lastDatasetId: datasetId,
  };
  return prisma.liveStat.upsert({
    where: { platform_uid_date: { platform: r.platform, uid: r.uid, date: r.date } },
    create: { platform: r.platform, uid: r.uid, date: r.date, ...shared },
    update: shared,
  });
}

// ── 工具 ─────────────────────────────────────────

/** "UID99162691563" → "99162691563";非该形态返回 null(交给 UID 列还原) */
function uidFromUid2(s: string): string | null {
  if (!s) return null;
  const m = /^UID(\d+)$/i.exec(s.trim());
  if (m) return m[1];
  if (/^\d+$/.test(s.trim())) return s.trim(); // 已是纯数字
  return null;
}

/** Excel 科学计数法 UID 还原成纯数字串;原本是数字则原样返回 */
function normalizeUid(s: string): string | null {
  if (!s) return null;
  if (/^\d+$/.test(s)) return s;
  const m = /^(\d+)(?:\.(\d+))?[eE]\+?(\d+)$/.exec(s);
  if (!m) return s;
  const [, intPart, decPart = "", expStr] = m;
  const exp = Number(expStr);
  const digits = intPart + decPart;
  const shift = exp - decPart.length;
  if (shift >= 0) return digits + "0".repeat(shift);
  const cut = digits.length + shift;
  return cut > 0 ? digits.slice(0, cut) : null;
}

/** "2026/7/1" / "2026-07-01" → UTC 零点 Date(供 @db.Date 存,避免本地时区导致日期偏移);失败 null。 */
function parseDateUtc(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseIntSafe(s: string | undefined): number {
  if (!s) return 0;
  const cleaned = s.replace(/[\s,]/g, "");
  if (!/^-?\d+$/.test(cleaned)) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseFloatSafe(s: string | undefined): number {
  if (!s) return 0;
  const cleaned = s.replace(/[\s,%]/g, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function nonEmpty(s: string | undefined): string | null {
  if (!s) return null;
  const v = s.trim();
  return v === "" ? null : v;
}

// 仅用于单测
export const _testing = { uidFromUid2, normalizeUid, parseDateUtc, parseIntSafe, parseFloatSafe };
