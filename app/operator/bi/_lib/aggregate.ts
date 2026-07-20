/**
 * BI 大屏 · 数据聚合层。
 *
 * 一次性把大屏所有指标拉齐,server component 直接 await。
 * 命中现有索引(submissions.createdAt / dailyVideoStat.snapshotDate)。
 *
 * 时区:DB 存 UTC,日聚合按"自然日(UTC)"切桶,前端用 lib/format 锁 Asia/Shanghai 显示。
 * 大屏指标按天的聚合接受 ±8h 的边界漂移,后续如需精确北京时区再加 AT TIME ZONE 偏移。
 */
import { prisma } from "@/lib/db";
import { chinaDateStart } from "@/lib/time";

const DAY_MS = 86_400_000;
const TREND_MAX_DAYS = 366; // 趋势窗口硬顶,防止超大区间拖垮查询

export type DashboardData = Awaited<ReturnType<typeof aggregateDashboard>>;

/** 解析 "YYYY-MM-DD" → UTC 零点 Date;非法返回 undefined。 */
function parseYmd(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

// 单个核心指标的时序:value=当月最新一日的值,increment=最新一日 − 前一快照日
// (当月不足两个快照日时为 null,即无可比基线),spark=当月各快照日的取值序列。
export type KpiMetric = { value: number; increment: number | null; spark: number[] };

/** 把「按快照日升序」的行序列压成一个 KpiMetric。pick 取每行的度量值。 */
function metricFromDays<T>(rows: T[], pick: (r: T) => number): KpiMetric {
  const spark = rows.map(pick);
  const value = spark.length ? spark[spark.length - 1] : 0;
  const increment =
    spark.length >= 2 ? value - spark[spark.length - 2] : null;
  return { value, increment, spark };
}

export async function aggregateDashboard(opts?: {
  trendFrom?: string;
  trendTo?: string;
}) {
  const now = new Date();

  // 「本月」按北京时间自然月切;snapshotDate 存的是 UTC 零点 = 北京自然日。
  const beijing = new Date(now.getTime() + 8 * 3_600_000);
  const monthStart = new Date(
    Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth(), 1),
  );
  const nextMonthStart = new Date(
    Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth() + 1, 1),
  );

  // ── 趋势窗口:默认结束日 = 昨天(T-1,数据最新只到前一日),向前 30 天 ──
  // 单位为北京自然日(UTC 零点),与 snapshotDate 同口径。可由 trendFrom/trendTo 覆盖。
  const trendEndDay =
    parseYmd(opts?.trendTo) ?? new Date(chinaDateStart(now).getTime() - DAY_MS);
  let trendStartDay =
    parseYmd(opts?.trendFrom) ?? new Date(trendEndDay.getTime() - 29 * DAY_MS);
  if (trendStartDay.getTime() > trendEndDay.getTime()) {
    trendStartDay = new Date(trendEndDay.getTime() - 29 * DAY_MS);
  }
  // 区间过大则从末尾回夹到硬顶
  if (trendEndDay.getTime() - trendStartDay.getTime() > TREND_MAX_DAYS * DAY_MS) {
    trendStartDay = new Date(trendEndDay.getTime() - (TREND_MAX_DAYS - 1) * DAY_MS);
  }

  const [
    // 核心指标 · 视频维度(按快照日):累计播放 / 作品数 / 优质作品(>10w)
    videoDays,
    // 核心指标 · 作者维度(按快照日):创作者数 / 优质作者(月播放>30w)
    authorDays,

    // 趋势(窗口内每快照日):累计播放 + 作品数(相邻日相减 → 当日增量)
    trendRows,
    trendSeedRows,

    // 右侧榜单:主播 TOP30(总播放) + 作品 TOP30(单作品播放)
    topAnchorsRaw,
    topVideosRaw,

    // 饼 1 · 作者分层(本月按播放总量)
    authorTierRaw,
    // 饼 2 · 作品分层(本月按单作品播放量)
    workTierRaw,
    // 饼 3 · 平台分布
    platformGroups,
    // 饼 4 · 创作者分组
    groupNoGroups,
  ] = await Promise.all([
    // 视频维度:每快照日一行。views 是「截至该日的累计播放」,
    // 故 SUM=当日全站累计播放;qworks=当日累计播放>10w 的作品数。
    // 排除 hidden(删除/隐藏)作品。
    prisma.$queryRaw<
      { day: Date; views: bigint; works: bigint; qworks: bigint }[]
    >`
      SELECT d."snapshotDate" AS day,
             COALESCE(SUM(d."views"), 0)::bigint AS views,
             COUNT(*)::bigint AS works,
             COUNT(*) FILTER (WHERE d."views" > 100000)::bigint AS qworks
      FROM "DailyVideoStat" d
      LEFT JOIN "VideoStat" v
        ON v."platform" = d."platform" AND v."externalId" = d."externalId"
      WHERE d."snapshotDate" >= ${monthStart} AND d."snapshotDate" < ${nextMonthStart}
        AND COALESCE(v."hidden", false) = false
      GROUP BY d."snapshotDate"
      ORDER BY d."snapshotDate"`,

    // 作者维度:先按 (快照日, 作者) 汇总累计播放,再数作者。
    // 作者身份取 CSV 的 creatorUid(未匹配系统 Creator 也算),回退 creatorId。
    prisma.$queryRaw<{ day: Date; creators: bigint; qcreators: bigint }[]>`
      SELECT day,
             COUNT(*)::bigint AS creators,
             COUNT(*) FILTER (WHERE author_views > 300000)::bigint AS qcreators
      FROM (
        SELECT d."snapshotDate" AS day,
               COALESCE(v."creatorUid", d."creatorId") AS author,
               SUM(d."views") AS author_views
        FROM "DailyVideoStat" d
        LEFT JOIN "VideoStat" v
          ON v."platform" = d."platform" AND v."externalId" = d."externalId"
        WHERE d."snapshotDate" >= ${monthStart} AND d."snapshotDate" < ${nextMonthStart}
          AND COALESCE(v."hidden", false) = false
          AND COALESCE(v."creatorUid", d."creatorId") IS NOT NULL
        GROUP BY d."snapshotDate", COALESCE(v."creatorUid", d."creatorId")
      ) pa
      GROUP BY day
      ORDER BY day`,

    // 窗口内每快照日:累计播放之和 + 在库作品数(相邻两日相减 → 当日增量)
    prisma.$queryRaw<{ day: Date; views: bigint; works: bigint }[]>`
      SELECT d."snapshotDate" AS day,
             COALESCE(SUM(d."views"), 0)::bigint AS views,
             COUNT(*)::bigint AS works
      FROM "DailyVideoStat" d
      LEFT JOIN "VideoStat" v
        ON v."platform" = d."platform" AND v."externalId" = d."externalId"
      WHERE d."snapshotDate" >= ${trendStartDay} AND d."snapshotDate" <= ${trendEndDay}
        AND COALESCE(v."hidden", false) = false
      GROUP BY d."snapshotDate" ORDER BY d."snapshotDate"`,
    // 种子:窗口开始前最近一个快照日的累计播放 / 作品数(算窗口第一天的增量)。
    // hasPrev 标记窗口前是否存在任何快照——无基线(数据首日)时首点增量置 0,不画尖峰。
    prisma.$queryRaw<{ views: bigint; works: bigint; hasPrev: boolean }[]>`
      SELECT COALESCE(SUM(d."views"), 0)::bigint AS views,
             COUNT(*)::bigint AS works,
             EXISTS(
               SELECT 1 FROM "DailyVideoStat" WHERE "snapshotDate" < ${trendStartDay}
             ) AS "hasPrev"
      FROM "DailyVideoStat" d
      LEFT JOIN "VideoStat" v
        ON v."platform" = d."platform" AND v."externalId" = d."externalId"
      WHERE d."snapshotDate" = (
        SELECT MAX("snapshotDate") FROM "DailyVideoStat" WHERE "snapshotDate" < ${trendStartDay}
      ) AND COALESCE(v."hidden", false) = false`,

    // 主播 TOP30:按作者(creatorUid,回退 creatorName)聚合总播放,取昵称
    prisma.$queryRaw<{ author: string; name: string | null; views: bigint }[]>`
      SELECT COALESCE("creatorUid", "creatorName") AS author,
             MAX("creatorName") AS name,
             COALESCE(SUM("views"), 0)::bigint AS views
      FROM "VideoStat"
      WHERE "hidden" = false AND COALESCE("creatorUid", "creatorName") IS NOT NULL
      GROUP BY COALESCE("creatorUid", "creatorName")
      ORDER BY views DESC
      LIMIT 30`,

    // 作品 TOP30:按单作品播放量排序(带 url 用于跳抖音)
    prisma.$queryRaw<
      { externalId: string; title: string; url: string; views: number }[]
    >`
      SELECT "externalId", "title", "url", "views"
      FROM "VideoStat"
      WHERE "hidden" = false
      ORDER BY "views" DESC
      LIMIT 30`,

    // 作者分层:本月最新快照日,每作者累计播放分桶计数(与「优质作者」同口径)
    prisma.$queryRaw<
      { top: bigint; head: bigint; mid: bigint; waist: bigint; tail: bigint }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE av >= 3000000)::bigint AS top,
        COUNT(*) FILTER (WHERE av >= 1000000 AND av < 3000000)::bigint AS head,
        COUNT(*) FILTER (WHERE av >= 300000 AND av < 1000000)::bigint AS mid,
        COUNT(*) FILTER (WHERE av >= 100000 AND av < 300000)::bigint AS waist,
        COUNT(*) FILTER (WHERE av >  0 AND av < 100000)::bigint AS tail
      FROM (
        SELECT COALESCE(v."creatorUid", d."creatorId") AS author, SUM(d."views") AS av
        FROM "DailyVideoStat" d
        LEFT JOIN "VideoStat" v
          ON v."platform" = d."platform" AND v."externalId" = d."externalId"
        WHERE d."snapshotDate" = (
          SELECT MAX("snapshotDate") FROM "DailyVideoStat"
          WHERE "snapshotDate" >= ${monthStart} AND "snapshotDate" < ${nextMonthStart}
        )
          AND COALESCE(v."hidden", false) = false
          AND COALESCE(v."creatorUid", d."creatorId") IS NOT NULL
        GROUP BY COALESCE(v."creatorUid", d."creatorId")
      ) pa`,
    // 作品分层:本月最新快照日,按单作品累计播放分桶计数
    prisma.$queryRaw<
      { top: bigint; head: bigint; mid: bigint; waist: bigint; tail: bigint }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE av >= 1000000)::bigint AS top,
        COUNT(*) FILTER (WHERE av >= 300000 AND av < 1000000)::bigint AS head,
        COUNT(*) FILTER (WHERE av >= 100000 AND av < 300000)::bigint AS mid,
        COUNT(*) FILTER (WHERE av >= 12000 AND av < 100000)::bigint AS waist,
        COUNT(*) FILTER (WHERE av >= 0 AND av < 12000)::bigint AS tail
      FROM (
        SELECT d."views" AS av
        FROM "DailyVideoStat" d
        LEFT JOIN "VideoStat" v
          ON v."platform" = d."platform" AND v."externalId" = d."externalId"
        WHERE d."snapshotDate" = (
          SELECT MAX("snapshotDate") FROM "DailyVideoStat"
          WHERE "snapshotDate" >= ${monthStart} AND "snapshotDate" < ${nextMonthStart}
        )
          AND COALESCE(v."hidden", false) = false
      ) pw`,
    prisma.submission.groupBy({
      by: ["platform"],
      _count: { _all: true },
      orderBy: { _count: { platform: "desc" } },
    }),
    prisma.creator.groupBy({
      by: ["groupNo"],
      _count: { _all: true },
      orderBy: { _count: { groupNo: "desc" } },
    }),
  ]);

  // ── 趋势:窗口内每日「作品增量」+「播放量增量」────────────────
  // 两者都是累计快照,相邻两个快照日相减 = 当日新增;无快照的日增量记 0。
  const trendDays = buildDayRange(trendStartDay, trendEndDay);
  const trendMap = new Map(
    trendRows.map((r) => [
      new Date(r.day).toISOString().slice(0, 10),
      { views: Number(r.views), works: Number(r.works) },
    ]),
  );
  let prevViews = Number(trendSeedRows[0]?.views ?? 0);
  let prevWorks = Number(trendSeedRows[0]?.works ?? 0);
  // 窗口前无任何快照 = 数据首日,首个快照点只作基线,增量置 0(不画整段累计的尖峰)
  let seeded = trendSeedRows[0]?.hasPrev ?? false;
  const trend = trendDays.map((d) => {
    const key = d.toISOString().slice(0, 10);
    const cur = trendMap.get(key);
    let viewsDelta = 0;
    let worksDelta = 0;
    if (cur) {
      if (seeded) {
        viewsDelta = cur.views - prevViews;
        worksDelta = cur.works - prevWorks;
      }
      prevViews = cur.views;
      prevWorks = cur.works;
      seeded = true;
    }
    return { date: key, worksDelta, viewsDelta };
  });

  // 核心指标(当月,按快照日)——每项 { value, increment, spark }
  const kpi = {
    playTotal: metricFromDays(videoDays, (r) => Number(r.views)), // 播放总量(累计)
    workTotal: metricFromDays(videoDays, (r) => Number(r.works)), // 作品(稿件)总量
    qualityCreators: metricFromDays(authorDays, (r) => Number(r.qcreators)), // 优质作者 >30w
    qualityWorks: metricFromDays(videoDays, (r) => Number(r.qworks)), // 优质作品 >10w
    creators: metricFromDays(authorDays, (r) => Number(r.creators)), // 当月发布作品的作者数
  };

  // 饼数据 — 颜色由组件按 index 注入 var(--chart-N),这里只产生 name/value/key
  const t = authorTierRaw[0] ?? {
    top: 0n,
    head: 0n,
    mid: 0n,
    waist: 0n,
    tail: 0n,
  };
  const authorTierPie = [
    { name: "顶部(≥300w)", value: Number(t.top), key: "top" },
    { name: "头部(≥100w)", value: Number(t.head), key: "head" },
    { name: "中部(≥30w)", value: Number(t.mid), key: "mid" },
    { name: "腰部(≥10w)", value: Number(t.waist), key: "waist" },
    { name: "尾部(<10w)", value: Number(t.tail), key: "tail" },
  ];
  const tw = workTierRaw[0] ?? {
    top: 0n,
    head: 0n,
    mid: 0n,
    waist: 0n,
    tail: 0n,
  };
  const workTierPie = [
    { name: "顶部(≥100w)", value: Number(tw.top), key: "top" },
    { name: "头部(≥30w)", value: Number(tw.head), key: "head" },
    { name: "中部(≥10w)", value: Number(tw.mid), key: "mid" },
    { name: "腰部(≥1.2w)", value: Number(tw.waist), key: "waist" },
    { name: "尾部(<1.2w)", value: Number(tw.tail), key: "tail" },
  ];
  const platformPie = platformGroups.slice(0, 5).map((g) => ({
    name: g.platform || "其他",
    value: g._count._all,
    key: g.platform || "_",
  }));
  const groupNoPie = groupNoGroups.slice(0, 5).map((g) => ({
    name: g.groupNo ? `团 ${g.groupNo}` : "未分组",
    value: g._count._all,
    key: g.groupNo ?? "_",
  }));

  // 右侧榜单
  const topAnchors = topAnchorsRaw.map((r, i) => ({
    rank: i + 1,
    name: r.name ?? r.author,
    search: r.author, // 跳视频页搜索用(优先 uid)
    views: Number(r.views),
  }));
  const topVideos = topVideosRaw.map((r, i) => ({
    rank: i + 1,
    externalId: r.externalId,
    title: r.title,
    url: r.url,
    views: Number(r.views),
  }));

  return {
    kpi,
    trend,
    // 回传解析后的窗口(YYYY-MM-DD),供日期控件回显
    trendRange: {
      from: trendStartDay.toISOString().slice(0, 10),
      to: trendEndDay.toISOString().slice(0, 10),
    },
    topAnchors,
    topVideos,
    pies: {
      authorTier: authorTierPie,
      workTier: workTierPie,
      platform: platformPie,
      groupNo: groupNoPie,
    },
  };
}

// ── 工具 ────────────────────────────────────────────────────

/** 生成 [start, end] 闭区间内每一天(UTC 零点)的序列。 */
function buildDayRange(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const s = new Date(start);
  s.setUTCHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setUTCHours(0, 0, 0, 0);
  for (let t = s.getTime(); t <= e.getTime(); t += DAY_MS) {
    out.push(new Date(t));
  }
  return out;
}

