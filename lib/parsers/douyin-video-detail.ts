/**
 * csvType="douyin_video_detail" 解析器。
 *
 * 必需列(可以不按顺序,CSV 可以多余列,只要这些都在):
 *   UID,主播名称,主播账号,视频链接,视频标题,发布时间,
 *   播放量,推荐播放量,点赞量,评论量,分享量,涨粉量,
 *   运营经纪人,招募经纪人,备注
 *
 * 列查找规则:按列名(不区分顺序);CSV 里多余的列直接忽略。
 *
 * 易踩坑点:
 *   - UID 被 Excel 转成科学计数法(如 "1.00449E+11"),要还原成长整数字串
 *   - 发布时间格式 "2026/5/1 20:19"(月日不补零、可能无秒)
 *   - 标题里的逗号是中文全角逗号 "," → CSV 仍以英文 "," 分隔,但 parser 必须支持 quoted 字段以防将来源换成 Excel 加引号导出
 *
 * 上库:
 *   - 按 (platform="douyin", externalId=URL 里的 /video/<id>) upsert 到 VideoStat
 *   - 创作者匹配:一次拉所有 dyUid 命中的 Creator,内存 map,upsert 时塞 creatorId
 *   - 100 条一批走事务,避免单大事务长锁
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { parseCsv } from "./csv";
import { applyFilterTree } from "./csv-helpers";
import type { Parser } from "./types";

const REQUIRED_COLUMNS = [
  "UID",
  "主播名称",
  "主播账号",
  "视频链接",
  "视频标题",
  "发布时间",
  "播放量",
  "推荐播放量",
  "点赞量",
  "评论量",
  "分享量",
  "涨粉量",
  "运营经纪人",
  "招募经纪人",
  "备注",
] as const;

const BATCH_SIZE = 100;

type ParsedRow = {
  externalId: string;
  url: string;
  title: string;
  publishedAt: Date | null;
  creatorUid: string | null;
  creatorName: string | null;
  creatorAccount: string | null;
  views: number;
  recommendedViews: number;
  likes: number;
  comments: number;
  shares: number;
  fansGained: number;
  operatorAgent: string | null;
  recruitAgent: string | null;
  note: string | null;
};

export const parseDouyinVideoDetail: Parser = async (csv, ctx) => {
  const rows = parseCsv(csv);
  if (rows.length === 0) return { rowCount: 0 };

  // 列头校验:按"必需列名是否都在"判断,不要求顺序。
  // 重复列名取最后一次出现的索引(Excel 偶尔会同名列,后面那个一般是真值)。
  const headers = rows[0].map((h) => h.trim());
  const headerIndex = new Map<string, number>();
  headers.forEach((h, i) => headerIndex.set(h, i));

  const missing = REQUIRED_COLUMNS.filter((c) => !headerIndex.has(c));
  if (missing.length > 0) {
    throw new Error(
      `缺少必需列:${missing.join("、")};实际表头:${headers.join(",")}`,
    );
  }

  // 数据行:跳过全空行;按列名查值,允许 CSV 里多余的列(忽略)
  const minCols = Math.max(...REQUIRED_COLUMNS.map((c) => headerIndex.get(c)!)) + 1;
  const dataRows: ParsedRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((c) => c.trim() === "")) continue;
    if (row.length < minCols) {
      throw new Error(
        `第 ${r + 1} 行只有 ${row.length} 列,不足以覆盖必需列(最远需到第 ${minCols} 列)`,
      );
    }

    // 把整行装成"列名 → 字符串"形式,先给通用 filter 用,再交给 mapRow 做类型 cast
    const rowByName: Record<string, string> = {};
    for (const [name, i] of headerIndex.entries()) {
      rowByName[name] = row[i] ?? "";
    }
    if (!applyFilterTree(rowByName, ctx.filterRoot)) continue; // 不满足产物清单 filter → 跳过

    const parsed = mapRow(row, headerIndex, r + 1);
    if (!parsed) continue;
    dataRows.push(parsed);
  }

  if (dataRows.length === 0) return { rowCount: 0 };

  // 批量匹配系统创作者:用所有非空 dyUid 一次性查
  const uids = Array.from(
    new Set(
      dataRows
        .map((r) => r.creatorUid)
        .filter((u): u is string => !!u),
    ),
  );
  const creators = uids.length
    ? await prisma.creator.findMany({
        where: { dyUid: { in: uids } },
        select: { id: true, dyUid: true },
      })
    : [];
  const uidToCreator = new Map<string, string>();
  for (const c of creators) if (c.dyUid) uidToCreator.set(c.dyUid, c.id);

  // 分批 upsert
  let processed = 0;
  for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
    const batch = dataRows.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      batch.map((r) => buildUpsert(r, uidToCreator, ctx.datasetId)),
    );
    processed += batch.length;
  }

  return { rowCount: processed };
};

function mapRow(
  cells: string[],
  headerIndex: Map<string, number>,
  _lineNo: number,
): ParsedRow | null {
  const get = (name: string): string => {
    const i = headerIndex.get(name);
    return i === undefined ? "" : (cells[i] ?? "").trim();
  };

  const url = get("视频链接");
  if (!url) {
    // 视频链接列为空 → 跳过(常见于表底的汇总行 / 占位行)
    return null;
  }
  const externalId = parseVideoId(url);
  if (!externalId) {
    // URL 存在但解析不出视频 id(格式异常)→ 跳过,不让单行毁掉整次解析
    return null;
  }
  return {
    externalId,
    url,
    title: get("视频标题"),
    publishedAt: parseChineseDate(get("发布时间")),
    creatorUid: normalizeUid(get("UID")),
    creatorName: nonEmpty(get("主播名称")),
    creatorAccount: nonEmpty(get("主播账号")),
    views: parseIntSafe(get("播放量")),
    recommendedViews: parseIntSafe(get("推荐播放量")),
    likes: parseIntSafe(get("点赞量")),
    comments: parseIntSafe(get("评论量")),
    shares: parseIntSafe(get("分享量")),
    fansGained: parseIntSafe(get("涨粉量")),
    operatorAgent: nonEmpty(get("运营经纪人")),
    recruitAgent: nonEmpty(get("招募经纪人")),
    note: nonEmpty(get("备注")),
  };
}

function buildUpsert(
  r: ParsedRow,
  uidToCreator: Map<string, string>,
  datasetId: string,
): Prisma.PrismaPromise<unknown> {
  const creatorId = r.creatorUid ? uidToCreator.get(r.creatorUid) ?? null : null;
  const shared = {
    url: r.url,
    title: r.title,
    publishedAt: r.publishedAt,
    creatorUid: r.creatorUid,
    creatorName: r.creatorName,
    creatorAccount: r.creatorAccount,
    creatorId,
    views: r.views,
    recommendedViews: r.recommendedViews,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    fansGained: r.fansGained,
    operatorAgent: r.operatorAgent,
    recruitAgent: r.recruitAgent,
    note: r.note,
    lastDatasetId: datasetId,
  };
  return prisma.videoStat.upsert({
    where: {
      platform_externalId: { platform: "douyin", externalId: r.externalId },
    },
    create: { platform: "douyin", externalId: r.externalId, ...shared },
    update: shared,
  });
}

// ── 工具 ─────────────────────────────────────────

function parseVideoId(url: string): string | null {
  const m = /\/video\/(\d+)/.exec(url);
  return m ? m[1] : null;
}

/** 把 Excel 科学计数法的 UID 还原成纯数字串;原本就是数字则原样返回 */
function normalizeUid(s: string): string | null {
  if (!s) return null;
  if (/^\d+$/.test(s)) return s;
  // 形如 1.00449E+11、1E+11、3.14E+5
  const m = /^(\d+)(?:\.(\d+))?[eE]\+?(\d+)$/.exec(s);
  if (!m) return s; // 不是科学计数法,留原值(可能是英文 UID)
  const [, intPart, decPart = "", expStr] = m;
  const exp = Number(expStr);
  const digits = intPart + decPart;
  const shift = exp - decPart.length;
  if (shift >= 0) return digits + "0".repeat(shift);
  // 负移很罕见(指数 < 小数位),直接截断
  const cut = digits.length + shift;
  return cut > 0 ? digits.slice(0, cut) : null;
}

/** "2026/5/1 20:19" / "2026/05/01 20:19:30" → Date;失败返回 null。
 *  以本地时区构造,与中台运行时区一致(部署在阿里云上海,CSV 来源也是国内)。*/
function parseChineseDate(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(
    s,
  );
  if (!m) return null;
  const [, y, mo, d, h, mi, se = "0"] = m;
  const dt = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(se),
  );
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseIntSafe(s: string | undefined): number {
  if (!s) return 0;
  // 容忍千分位逗号 / 空白
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

// 仅用于单测;不参与运行时调用
export const _testing = {
  parseVideoId,
  normalizeUid,
  parseChineseDate,
  parseIntSafe,
};
