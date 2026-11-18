import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateValue } from "@/lib/data-period";
import { chinaDateString } from "@/lib/time";
import { biRange, buildBiTrend, type SnapshotDay } from "./series";

export type DashboardData = Awaited<ReturnType<typeof aggregateDashboard>>;
export type Distribution = { label: string; count: number }[];

/** All content panels use the same current, visible publication cohort (Beijing dates). */
export async function aggregateDashboard(opts?: {
  trendFrom?: string;
  trendTo?: string;
}) {
  const now = new Date();
  const currentRange = biRange({}, now);
  const requestedEnd = dateValue(opts?.trendTo);
  // Open dormant datasets on useful data, with the actual historical dates visible.
  const latest = requestedEnd
    ? null
    : await prisma.videoStat.findFirst({
        where: {
          hidden: false,
          publishedAt: { lt: currentRange.publishedAt.lt },
        },
        orderBy: { publishedAt: { sort: "desc", nulls: "last" } },
        select: { publishedAt: true },
      });
  const range = biRange(
    opts,
    now,
    latest?.publishedAt ? chinaDateString(latest.publishedAt) : undefined,
  );
  const { gte, lt } = range.publishedAt;
  const where = { hidden: false, publishedAt: range.publishedAt };
  const cohort = Prisma.sql`v.hidden = false AND v."publishedAt" >= ${gte} AND v."publishedAt" < ${lt}`;

  const [summary, authors, publications, snapshots, topVideos, platforms] =
    await Promise.all([
      prisma.$queryRaw<
        {
          works: number;
          views: bigint;
          recommended: bigint;
          highPlayWorks: number;
          approved: number;
          rejected: number;
          pending: number;
          unassigned: number;
          million: number;
          threeHundred: number;
          hundred: number;
          twelve: number;
          below: number;
        }[]
      >(Prisma.sql`
      SELECT COUNT(*)::int AS works, COALESCE(SUM(v.views), 0)::bigint AS views,
        COALESCE(SUM(v."recommendedViews"), 0)::bigint AS recommended,
        COUNT(*) FILTER (WHERE v.views >= 100000)::int AS "highPlayWorks",
        COUNT(*) FILTER (WHERE v."reviewStatus" = 'APPROVED')::int AS approved,
        COUNT(*) FILTER (WHERE v."reviewStatus" = 'REJECTED')::int AS rejected,
        COUNT(*) FILTER (WHERE v."reviewStatus" = 'PENDING')::int AS pending,
        COUNT(*) FILTER (WHERE v."reviewStatus" = 'PENDING' AND NOT EXISTS (
          SELECT 1 FROM "VideoReviewAssignment" a WHERE a."videoId" = v.id
        ))::int AS unassigned,
        COUNT(*) FILTER (WHERE v.views >= 1000000)::int AS million,
        COUNT(*) FILTER (WHERE v.views >= 300000 AND v.views < 1000000)::int AS "threeHundred",
        COUNT(*) FILTER (WHERE v.views >= 100000 AND v.views < 300000)::int AS hundred,
        COUNT(*) FILTER (WHERE v.views >= 12000 AND v.views < 100000)::int AS twelve,
        COUNT(*) FILTER (WHERE v.views < 12000)::int AS below
      FROM "VideoStat" v WHERE ${cohort}
    `),
      prisma.$queryRaw<
        {
          platform: string;
          uid: string;
          name: string | null;
          views: bigint;
          works: number;
        }[]
      >(Prisma.sql`
      SELECT v.platform, v."creatorUid" AS uid, MAX(NULLIF(v."creatorName", '')) AS name,
        SUM(v.views)::bigint AS views, COUNT(*)::int AS works
      FROM "VideoStat" v WHERE ${cohort} AND NULLIF(BTRIM(v."creatorUid"), '') IS NOT NULL
      GROUP BY v.platform, v."creatorUid" ORDER BY views DESC, v.platform, v."creatorUid"
    `),
      prisma.$queryRaw<{ date: string; works: number }[]>(Prisma.sql`
      SELECT TO_CHAR(v."publishedAt" + INTERVAL '8 hours', 'YYYY-MM-DD') AS date, COUNT(*)::int AS works
      FROM "VideoStat" v WHERE ${cohort} GROUP BY date ORDER BY date
    `),
      // One windowed scan, including the preceding day for the baseline. Avoid a
      // full-table self hash join, which exhausts default Docker /dev/shm on large ranges.
      prisma.$queryRaw<SnapshotDay[]>(Prisma.sql`
      WITH samples AS (
        SELECT d."snapshotDate" AS day, d.views,
          LAG(d.views) OVER video AS previous_views,
          LAG(d."snapshotDate") OVER video AS previous_day
        FROM "DailyVideoStat" d
        JOIN "VideoStat" v ON v.platform = d.platform AND v."externalId" = d."externalId"
        WHERE ${cohort}
          AND d."snapshotDate" >= ${new Date(new Date(`${range.from}T00:00:00Z`).getTime() - 86400000)}
          AND d."snapshotDate" <= ${new Date(`${range.to}T00:00:00Z`)}
        WINDOW video AS (PARTITION BY d.platform, d."externalId" ORDER BY d."snapshotDate")
      )
      SELECT day, COUNT(*)::int AS recorded,
        COUNT(*) FILTER (WHERE previous_day = day - 1)::int AS matched,
        (SUM(views::bigint - previous_views::bigint) FILTER (WHERE previous_day = day - 1))::bigint AS change
      FROM samples WHERE day >= ${new Date(`${range.from}T00:00:00Z`)}
      GROUP BY day ORDER BY day
    `),
      prisma.videoStat.findMany({
        where,
        orderBy: [{ views: "desc" }, { id: "asc" }],
        take: 10,
        select: {
          id: true,
          title: true,
          url: true,
          views: true,
          externalId: true,
          platform: true,
        },
      }),
      prisma.videoStat.groupBy({
        by: ["platform"],
        where,
        _count: { _all: true },
        orderBy: { _count: { platform: "desc" } },
      }),
    ]);

  const totals = {
    works: summary[0].works,
    views: Number(summary[0].views),
    recommended: Number(summary[0].recommended),
    authors: authors.length,
    highPlayWorks: summary[0].highPlayWorks,
    approved: summary[0].approved,
    rejected: summary[0].rejected,
    pending: summary[0].pending,
    unassigned: summary[0].unassigned,
  };
  const authorTiers: Distribution = [
    { label: "300 万及以上", count: 0 },
    { label: "100 万–不足 300 万", count: 0 },
    { label: "30 万–不足 100 万", count: 0 },
    { label: "10 万–不足 30 万", count: 0 },
    { label: "不足 10 万", count: 0 },
  ];
  for (const author of authors) {
    const views = Number(author.views);
    authorTiers[
      views >= 3000000
        ? 0
        : views >= 1000000
          ? 1
          : views >= 300000
            ? 2
            : views >= 100000
              ? 3
              : 4
    ].count++;
  }
  const trend = buildBiTrend(range, snapshots, publications);
  return {
    range: { from: range.from, to: range.to },
    historicalDefault: !requestedEnd && range.to < currentRange.to,
    totals,
    trend,
    comparableDays: trend.filter((day) => day.viewsChange !== null).length,
    topAuthors: authors
      .slice(0, 10)
      .map((author) => ({ ...author, views: Number(author.views) })),
    topVideos,
    structure: {
      authors: authorTiers,
      works: [
        { label: "100 万及以上", count: summary[0].million },
        { label: "30 万–不足 100 万", count: summary[0].threeHundred },
        { label: "10 万–不足 30 万", count: summary[0].hundred },
        { label: "1.2 万–不足 10 万", count: summary[0].twelve },
        { label: "不足 1.2 万", count: summary[0].below },
      ],
      platforms: platforms.map((row) => ({
        label: row.platform === "douyin" ? "抖音" : row.platform,
        count: row._count._all,
      })),
    },
    loadedAt: new Date().toISOString(),
  };
}
