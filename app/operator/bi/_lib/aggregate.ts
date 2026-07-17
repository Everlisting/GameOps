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

const DAY_MS = 86_400_000;

export type DashboardData = Awaited<ReturnType<typeof aggregateDashboard>>;

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

export async function aggregateDashboard() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

  // 「本月」按北京时间自然月切;snapshotDate 存的是 UTC 零点 = 北京自然日。
  const beijing = new Date(now.getTime() + 8 * 3_600_000);
  const monthStart = new Date(
    Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth(), 1),
  );
  const nextMonthStart = new Date(
    Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth() + 1, 1),
  );

  const [
    // 核心指标 · 视频维度(按快照日):累计播放 / 作品数 / 优质作品(>10w)
    videoDays,
    // 核心指标 · 作者维度(按快照日):创作者数 / 优质作者(月播放>30w)
    authorDays,

    // 趋势:30 天每日 投稿/通过
    submissionsByDay,
    approvedByDay,

    // Top 创作者:30d 总播放
    topCreatorsRaw,

    // 饼 1 · 稿件状态
    submissionStatusGroups,
    // 饼 2 · 活动状态
    activityStatusGroups,
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

    prisma.$queryRaw<{ day: Date; n: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS n
      FROM "Submission"
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ day: Date; n: bigint }[]>`
      SELECT date_trunc('day', "updatedAt") AS day, COUNT(*)::bigint AS n
      FROM "Submission"
      WHERE "updatedAt" >= ${thirtyDaysAgo} AND "status" = 'APPROVED'
      GROUP BY 1 ORDER BY 1`,

    prisma.$queryRaw<
      { creatorId: string; nickname: string; views: bigint }[]
    >`
      SELECT c."id" AS "creatorId", c."nickname", COALESCE(SUM(d."views"), 0)::bigint AS views
      FROM "DailyVideoStat" d
      JOIN "Creator" c ON c."id" = d."creatorId"
      -- 排除已被判定删除/隐藏的作品(不做任何统计)
      LEFT JOIN "VideoStat" v
        ON v."platform" = d."platform" AND v."externalId" = d."externalId"
      WHERE d."snapshotDate" >= ${thirtyDaysAgo}
        AND COALESCE(v."hidden", false) = false
      GROUP BY c."id", c."nickname"
      ORDER BY views DESC
      LIMIT 8`,

    prisma.submission.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.activity.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
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

  // ── 拼成图表需要的形状 ────────────────────────────────────
  const trendDays = buildDailyBuckets(now, 30);
  const submissionsMap = bucketize(submissionsByDay);
  const approvedMap = bucketize(approvedByDay);
  const trend = trendDays.map((d) => {
    const key = d.toISOString().slice(0, 10);
    return {
      date: key,
      submitted: submissionsMap.get(key) ?? 0,
      approved: approvedMap.get(key) ?? 0,
    };
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
  const submissionStatusPie = submissionStatusGroups.map((g) => ({
    name: STATUS_LABEL[g.status],
    value: g._count._all,
    key: g.status,
  }));
  const activityStatusPie = activityStatusGroups.map((g) => ({
    name: ACTIVITY_LABEL[g.status],
    value: g._count._all,
    key: g.status,
  }));
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

  // Top 创作者
  const topCreators = topCreatorsRaw.map((r, i) => ({
    rank: i + 1,
    creatorId: r.creatorId,
    nickname: r.nickname,
    views: Number(r.views),
  }));

  return {
    kpi,
    trend,
    topCreators,
    pies: {
      submissionStatus: submissionStatusPie,
      activityStatus: activityStatusPie,
      platform: platformPie,
      groupNo: groupNoPie,
    },
  };
}

// ── 工具 ────────────────────────────────────────────────────

function buildDailyBuckets(end: Date, days: number): Date[] {
  const out: Date[] = [];
  const e = new Date(end);
  e.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(e.getTime() - i * DAY_MS));
  }
  return out;
}

function bucketize(rows: { day: Date; n: bigint }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const key = new Date(r.day).toISOString().slice(0, 10);
    m.set(key, Number(r.n));
  }
  return m;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "待审",
  APPROVED: "已通过",
  REJECTED: "未通过",
};
const ACTIVITY_LABEL: Record<string, string> = {
  DRAFT: "草稿",
  ONGOING: "进行中",
  ENDED: "已结束",
};
