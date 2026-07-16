/**
 * 主播数据筛选口径 + 聚合口径 —— 服务端 page.tsx(及后续导出)共用。
 *
 * 名单基表:AnchorStat(导入维护,一行 = 一个主播)。
 * 数值指标 = 按 UID LEFT JOIN 两段子查询:
 *   - 视频明细(VideoStat,hidden=false):作品数 / 作品播放量 / 作品推荐播放量 / 涨粉。
 *   - 直播明细(LiveStat):直播天数(=开播天数)/ 直播时长(SUM)/ ACU(开播天数均值)/ 曝光人数·次数(SUM)/
 *     进直播间人数·次数(SUM)/ 人均观看时长(开播天数均值)。「率·均值」类按开播天数平均。
 *   无作品/无直播的主播照样在名单里(聚合值为 0)。
 *
 * 名单筛选(搜索 / 团号)作用于 AnchorStat;日期范围只收窄两段聚合子查询(不影响名单在列)。
 * 未指定日期时,数值指标默认只统计「本月」(与视频页口径一致)。hidden=true 的视频不参与聚合。
 */
import { Prisma } from "@prisma/client";

import { ALLOWED_SORT_BY, DEFAULT_SORT_BY, type SortField } from "../_components/config";

export type AnchorSearchParams = {
  q?: string;
  groupNo?: string;
  publishedFrom?: string;
  publishedTo?: string;
  sortBy?: string;
  order?: string;
};

export type AnchorQuery = {
  q: string;
  groupNo: string;
  publishedFrom: string;
  publishedTo: string;
  sortBy: SortField;
  order: "asc" | "desc";
  /** WHERE 片段,作用于名单基表别名 a(AnchorStat) */
  rosterWhere: Prisma.Sql;
  /** LEFT JOIN 片段:按 creatorUid 聚合的视频明细子查询,别名 vs,ON vs.uid = a."uid" */
  aggJoin: Prisma.Sql;
  /** LEFT JOIN 片段:按 uid 聚合的直播明细子查询,别名 ls,ON ls.uid = a."uid" */
  liveAggJoin: Prisma.Sql;
  /** ORDER BY 片段(白名单映射,无用户注入) */
  orderSql: Prisma.Sql;
  /** 非空(如 "2026-07")= 作品指标处于「本月默认」范围,用于页面/导出文案 */
  defaultMonth: string | null;
};

function clampSortBy(raw: string | undefined): SortField {
  return (ALLOWED_SORT_BY as readonly string[]).includes(raw ?? "")
    ? (raw as SortField)
    : DEFAULT_SORT_BY;
}

function clampOrder(raw: string | undefined): "asc" | "desc" {
  return raw === "asc" ? "asc" : "desc";
}

function parseISODate(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** 排序字段 → 表达式(白名单,固定字符串)。聚合列取 COALESCE(*,0),名单列取 a.* */
const SORT_EXPR: Record<SortField, Prisma.Sql> = {
  worksViews: Prisma.sql`COALESCE(vs."views", 0)`,
  worksRecommendedViews: Prisma.sql`COALESCE(vs."rec", 0)`,
  worksCount: Prisma.sql`COALESCE(vs."works", 0)`,
  fansGained: Prisma.sql`COALESCE(vs."fansGained", 0)`,
  fans: Prisma.sql`a."fans"`,
  joinedAt: Prisma.sql`a."joinedAt"`,
  updatedAt: Prisma.sql`a."updatedAt"`,
  anchorDays: Prisma.sql`COALESCE(ls."anchorDays", 0)`,
  liveDuration: Prisma.sql`COALESCE(ls."liveDuration", 0)`,
  acu: Prisma.sql`COALESCE(ls."acu", 0)`,
  exposureUsers: Prisma.sql`COALESCE(ls."exposureUsers", 0)`,
  enterRoomUsers: Prisma.sql`COALESCE(ls."enterRoomUsers", 0)`,
};

export function buildAnchorQuery(sp: AnchorSearchParams | undefined): AnchorQuery {
  const q = sp?.q?.trim() ?? "";
  const groupNo = sp?.groupNo?.trim() ?? "";
  const publishedFrom = sp?.publishedFrom?.trim() ?? "";
  const publishedTo = sp?.publishedTo?.trim() ?? "";
  const sortBy = clampSortBy(sp?.sortBy);
  const order = clampOrder(sp?.order);

  // ── 名单筛选(AnchorStat a)──────────────────────────
  const rosterConds: Prisma.Sql[] = [];
  if (q) {
    const like = `%${q}%`;
    rosterConds.push(
      Prisma.sql`(a."uid" ILIKE ${like} OR a."nickname" ILIKE ${like} OR a."account" ILIKE ${like})`,
    );
  }
  if (groupNo) {
    rosterConds.push(Prisma.sql`a."groupNo" ILIKE ${`%${groupNo}%`}`);
  }
  const rosterWhere = rosterConds.length ? Prisma.join(rosterConds, " AND ") : Prisma.sql`TRUE`;

  // ── 统计窗口:指定日期则按区间收窄;未指定则默认「本月」(与视频页一致)──
  // 同一窗口同时约束视频(publishedAt)与直播(date)两段聚合。
  const fromDate = parseISODate(publishedFrom);
  const toDate = parseISODate(publishedTo);
  let windowStart: Date | undefined;
  let windowEnd: Date | undefined; // 排他上界
  let defaultMonth: string | null = null;
  if (fromDate || toDate) {
    windowStart = fromDate;
    if (toDate) {
      const t = new Date(toDate);
      t.setDate(t.getDate() + 1);
      windowEnd = t;
    }
  } else {
    const now = new Date();
    windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
    windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  // ── 视频聚合子查询(VideoStat v)──────────────────
  const videoConds: Prisma.Sql[] = [
    Prisma.sql`v."hidden" = false`,
    Prisma.sql`v."creatorUid" IS NOT NULL`,
    Prisma.sql`v."creatorUid" <> ''`,
  ];
  if (windowStart) videoConds.push(Prisma.sql`v."publishedAt" >= ${windowStart}`);
  if (windowEnd) videoConds.push(Prisma.sql`v."publishedAt" < ${windowEnd}`);
  const videoWhere = Prisma.join(videoConds, " AND ");

  const aggJoin = Prisma.sql`
    LEFT JOIN (
      SELECT
        v."creatorUid"                                 AS uid,
        COUNT(*)                                       AS works,
        COALESCE(SUM(v."views"), 0)                    AS views,
        COALESCE(SUM(v."recommendedViews"), 0)         AS rec,
        COALESCE(SUM(v."fansGained"), 0)               AS "fansGained"
      FROM "VideoStat" v
      WHERE ${videoWhere}
      GROUP BY v."creatorUid"
    ) vs ON vs.uid = a."uid"`;

  // ── 直播聚合子查询(LiveStat l)────────────────────
  // 只入库了开播时长>0 的行,故 COUNT(*) = 开播天数;率/均值按开播天数平均(AVG)。
  const liveConds: Prisma.Sql[] = [];
  if (windowStart) liveConds.push(Prisma.sql`l."date" >= ${windowStart}`);
  if (windowEnd) liveConds.push(Prisma.sql`l."date" < ${windowEnd}`);
  const liveWhere = liveConds.length ? Prisma.join(liveConds, " AND ") : Prisma.sql`TRUE`;

  const liveAggJoin = Prisma.sql`
    LEFT JOIN (
      SELECT
        l."uid"                                        AS uid,
        COUNT(*)                                       AS "anchorDays",
        COALESCE(SUM(l."liveDuration"), 0)             AS "liveDuration",
        AVG(l."acu")                                   AS "acu",
        COALESCE(SUM(l."exposureUsers"), 0)            AS "exposureUsers",
        COALESCE(SUM(l."exposureCount"), 0)            AS "exposureCount",
        COALESCE(SUM(l."enterRoomUsers"), 0)           AS "enterRoomUsers",
        COALESCE(SUM(l."enterRoomCount"), 0)           AS "enterRoomCount",
        AVG(l."avgWatchDuration")                      AS "avgWatchDuration"
      FROM "LiveStat" l
      WHERE ${liveWhere}
      GROUP BY l."uid"
    ) ls ON ls.uid = a."uid"`;

  const orderSql = Prisma.sql`${SORT_EXPR[sortBy]} ${order === "asc" ? Prisma.raw("ASC") : Prisma.raw("DESC")} NULLS LAST`;

  return {
    q,
    groupNo,
    publishedFrom,
    publishedTo,
    sortBy,
    order,
    rosterWhere,
    aggJoin,
    liveAggJoin,
    orderSql,
    defaultMonth,
  };
}
