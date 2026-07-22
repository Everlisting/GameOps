/**
 * csvType="anchor_roster" 解析器 —— 主播名单(花名册)。
 *
 * 主播数据页的「名单」来源:运营导入(为主)/ 未来爬虫上报。名单独立于视频/直播明细,
 * 保证「本月没发作品的主播也在名单内」。数值指标(作品数 / 播放量 / 直播维度 …)
 * 在页面按 UID 实时聚合明细表,不在此落库。
 *
 * 本 parser 只写「身份 + 花名册」字段,按 (platform, uid) upsert 到 AnchorStat:
 *   主播平台 / UID(必需)/ 主播昵称 / 抖音号 / 入会时间 / 团号 / 运营经纪人 / 招募经纪人
 *   (可选)粉丝量 —— 若名单自带则一并存,后续直播明细接入后可覆盖。
 *
 * 容错:
 *   - 只有 UID 是必需列;其余列按「存在才更新」——名单文件缺某列时不会把库里已有值冲成空。
 *   - UID 被 Excel 转成科学计数法(1.0E+15)时还原成长整数字串。
 *   - platform 缺省 douyin;中文「抖音」归一到 "douyin",与视频明细 join 口径一致。
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { parseCsv } from "./csv";
import { applyFilterTree } from "./csv-helpers";
import type { Parser } from "./types";

const BATCH_SIZE = 200;

// 列名别名:表头命中任一即可(取最后一次出现的列)
const ALIASES = {
  platform: ["主播平台", "平台"],
  uid: ["UID", "uid", "主播UID", "主播uid"],
  nickname: ["主播昵称", "昵称", "主播名称"],
  account: ["抖音号", "主播账号", "账号"],
  joinedAt: ["入会时间", "入会日期", "加入时间"],
  groupNo: ["团号", "团队号"],
  operatorAgent: ["运营经纪人", "运营"],
  recruitAgent: ["招募经纪人", "招募经济人", "招募"],
  fans: ["粉丝量", "粉丝数", "粉丝"],
} as const;

type Field = keyof typeof ALIASES;

type RosterRow = {
  platform: string;
  uid: string;
  nickname: string | null;
  account: string | null;
  joinedAt: Date | null;
  groupNo: string | null;
  operatorAgent: string | null;
  recruitAgent: string | null;
  fans: number | null;
};

export const parseAnchorRoster: Parser = async (csv, ctx) => {
  const rows = parseCsv(csv);
  if (rows.length === 0) return { rowCount: 0 };

  const headers = rows[0].map((h) => h.trim());
  const headerIndex = new Map<string, number>();
  headers.forEach((h, i) => headerIndex.set(h, i));

  // 每个逻辑字段解析到实际列下标(取命中的最后一个别名);UID 必需
  const colOf: Partial<Record<Field, number>> = {};
  for (const field of Object.keys(ALIASES) as Field[]) {
    for (const alias of ALIASES[field]) {
      if (headerIndex.has(alias)) colOf[field] = headerIndex.get(alias);
    }
  }
  if (colOf.uid === undefined) {
    throw new Error(`缺少必需列:UID;实际表头:${headers.join(",")}`);
  }

  // 「存在才更新」的字段集合(除 uid / platform 外,凡文件里出现的列都参与 update)
  const presentFields = (Object.keys(ALIASES) as Field[]).filter(
    (f) => f !== "uid" && f !== "platform" && colOf[f] !== undefined,
  );
  const hasFans = colOf.fans !== undefined;

  // 平台标签:运营导入时由弹窗下拉选定(paramValues.platform),对全表生效、覆盖 CSV「主播平台」列;
  // 爬虫上报不传时回退读 CSV 列(向后兼容)。
  const forcedPlatform = platformFromParam(ctx.paramValues?.["platform"]);

  const dataRows: RosterRow[] = [];
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

    const uid = normalizeUid(cell("uid"));
    if (!uid) continue; // 无 UID 的行(表底汇总 / 占位)跳过

    dataRows.push({
      platform: forcedPlatform ?? normalizePlatform(cell("platform")),
      uid,
      nickname: nonEmpty(cell("nickname")),
      account: nonEmpty(cell("account")),
      joinedAt: parseFlexibleDate(cell("joinedAt")),
      groupNo: nonEmpty(cell("groupNo")),
      operatorAgent: nonEmpty(cell("operatorAgent")),
      recruitAgent: nonEmpty(cell("recruitAgent")),
      fans: hasFans ? parseIntSafe(cell("fans")) : null,
    });
  }

  if (dataRows.length === 0) return { rowCount: 0 };

  let processed = 0;
  for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
    const batch = dataRows.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      batch.map((r) => buildUpsert(r, presentFields, ctx.datasetId)),
    );
    processed += batch.length;
  }

  return { rowCount: processed };
};

function buildUpsert(
  r: RosterRow,
  presentFields: Field[],
  datasetId: string,
): Prisma.PrismaPromise<unknown> {
  // 只把「文件里出现的列」放进 update,避免缺列时把库里已有值清空
  const optional: Record<string, unknown> = {};
  for (const f of presentFields) {
    if (f === "fans") optional.fans = r.fans ?? 0;
    else optional[f] = r[f];
  }

  return prisma.anchorStat.upsert({
    where: { platform_uid: { platform: r.platform, uid: r.uid } },
    create: {
      platform: r.platform,
      uid: r.uid,
      nickname: r.nickname,
      account: r.account,
      joinedAt: r.joinedAt,
      groupNo: r.groupNo,
      operatorAgent: r.operatorAgent,
      recruitAgent: r.recruitAgent,
      fans: r.fans ?? 0,
      lastDatasetId: datasetId,
    },
    update: { ...optional, lastDatasetId: datasetId },
  });
}

// ── 工具 ─────────────────────────────────────────

/** 弹窗下拉选定的平台参数 → 归一化平台码;空/非字符串 → null(回退读 CSV 列)。 */
function platformFromParam(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  return normalizePlatform(raw);
}

function normalizePlatform(s: string): string {
  const v = s.trim().toLowerCase();
  if (!v) return "douyin";
  if (v === "抖音" || v === "douyin") return "douyin";
  if (v === "快手" || v === "kuaishou") return "kuaishou";
  if (v === "b站" || v === "bilibili" || v === "哔哩哔哩") return "bilibili";
  if (v === "视频号" || v === "微信视频号") return "wechat_channels";
  return v;
}

/** Excel 科学计数法 UID 还原成纯数字串;原本是数字则原样返回 */
function normalizeUid(s: string): string | null {
  if (!s) return null;
  if (/^\d+$/.test(s)) return s;
  const m = /^(\d+)(?:\.(\d+))?[eE]\+?(\d+)$/.exec(s);
  if (!m) return s; // 非科学计数法,留原值(可能是英文 UID)
  const [, intPart, decPart = "", expStr] = m;
  const exp = Number(expStr);
  const digits = intPart + decPart;
  const shift = exp - decPart.length;
  if (shift >= 0) return digits + "0".repeat(shift);
  const cut = digits.length + shift;
  return cut > 0 ? digits.slice(0, cut) : null;
}

/** "2026/5/1" / "2026-05-01" / "2026-05-01 12:00(:00)" → 本地 Date;失败返回 null。 */
function parseFlexibleDate(s: string): Date | null {
  if (!s) return null;
  const t = s.trim();
  const dt = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(t);
  if (dt) {
    const [, y, mo, d] = dt;
    const out = new Date(Number(y), Number(mo) - 1, Number(d));
    return Number.isNaN(out.getTime()) ? null : out;
  }
  const dtm = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (dtm) {
    const [, y, mo, d, h, mi, se = "0"] = dtm;
    const out = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
    return Number.isNaN(out.getTime()) ? null : out;
  }
  return null;
}

function parseIntSafe(s: string | undefined): number {
  if (!s) return 0;
  const cleaned = s.replace(/[\s,]/g, "");
  if (!/^-?\d+$/.test(cleaned)) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function nonEmpty(s: string | undefined): string | null {
  if (!s) return null;
  const v = s.trim();
  return v === "" ? null : v;
}

// 仅用于单测
export const _testing = { normalizePlatform, normalizeUid, parseFlexibleDate, parseIntSafe };
