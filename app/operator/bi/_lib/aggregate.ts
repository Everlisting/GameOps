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
import { incentiveDb } from "@/lib/incentive/db";

const DAY_MS = 86_400_000;

export type DashboardData = Awaited<ReturnType<typeof aggregateDashboard>>;

export async function aggregateDashboard() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);

  const [
    // KPI
    pendingSubmissions,
    ongoingActivities,
    submissions30d,
    approved30d,
    creatorTotal,
    incentiveAgg,

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
    prisma.submission.count({ where: { status: "PENDING" } }),
    prisma.activity.count({ where: { status: "ONGOING" } }),
    prisma.submission.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.submission.count({
      where: { status: "APPROVED", updatedAt: { gte: thirtyDaysAgo } },
    }),
    prisma.creator.count(),
    incentiveDb
      .findMany({
        where: {},
        select: { estimated: true, adjusted: true },
      })
      .then((rows) =>
        rows.reduce(
          (acc, r) => {
            const v = r.adjusted ?? r.estimated;
            acc.total += Number(v);
            acc.count += 1;
            return acc;
          },
          { total: 0, count: 0 },
        ),
      ),

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

  // KPI sparkline:从 trend 取最后 14 天投稿数
  const sparkSubmissions = trend.slice(-14).map((d) => d.submitted);
  const sparkApproved = trend.slice(-14).map((d) => d.approved);

  // 计算"通过率",作为一个 KPI
  const totalForRate = trend.reduce((s, d) => s + d.submitted, 0);
  const approvedForRate = trend.reduce((s, d) => s + d.approved, 0);
  const approvalRate30d = totalForRate ? (approvedForRate / totalForRate) * 100 : 0;
  const sparkApprovalRate = trend.slice(-14).map((d) =>
    d.submitted ? Math.round((d.approved / d.submitted) * 100) : 0,
  );

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
    kpi: {
      pendingSubmissions,
      ongoingActivities,
      submissions30d,
      approved30d,
      creatorTotal,
      incentiveTotal: incentiveAgg.total,
      incentiveCount: incentiveAgg.count,
      approvalRate30d,
      sparkSubmissions,
      sparkApproved,
      sparkApprovalRate,
    },
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
