import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { chinaDateStart, chinaDateString } from "@/lib/time";
import { chinaDateTimeRange } from "@/lib/data-period";
import { hasRole } from "@/lib/roles";
import { forbidden } from "@/lib/errors";
import type { ReviewActor } from "@/lib/video-review-access";

export function overviewMonth(raw: string | undefined, now = new Date()) {
  const current = chinaDateString(now).slice(0, 7);
  const month =
    raw &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) &&
    raw >= "2000-01" &&
    raw <= current
      ? raw
      : current;
  const from = `${month}-01`;
  const end = new Date(`${from}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  const to =
    month === current ? chinaDateString(now) : end.toISOString().slice(0, 10);
  return { month, from, to, range: chinaDateTimeRange(from, to) };
}

export async function loadProjectOverview(
  period: ReturnType<typeof overviewMonth>,
) {
  const [totals, daily, anchors, live] = await Promise.all([
    prisma.$queryRaw<
      { works: number; authors: number; views: bigint; recommended: bigint }[]
    >(Prisma.sql`
      SELECT COUNT(*)::int AS works,
        COUNT(DISTINCT ("platform", "creatorUid")) FILTER (WHERE "creatorUid" IS NOT NULL AND BTRIM("creatorUid") <> '')::int AS authors,
        COALESCE(SUM("views"), 0)::bigint AS views,
        COALESCE(SUM("recommendedViews"), 0)::bigint AS recommended
      FROM "VideoStat" WHERE "hidden" = false
        AND "publishedAt" >= ${period.range.gte!} AND "publishedAt" < ${period.range.lt!}
    `),
    prisma.$queryRaw<{ date: string; works: number }[]>(Prisma.sql`
      SELECT TO_CHAR("publishedAt" + INTERVAL '8 hours', 'YYYY-MM-DD') AS date, COUNT(*)::int AS works
      FROM "VideoStat" WHERE "hidden" = false
        AND "publishedAt" >= ${period.range.gte!} AND "publishedAt" < ${period.range.lt!}
      GROUP BY 1 ORDER BY 1
    `),
    prisma.anchorStat.count(),
    prisma.liveStat.aggregate({
      where: {
        date: {
          gte: new Date(`${period.from}T00:00:00Z`),
          lte: new Date(`${period.to}T00:00:00Z`),
        },
      },
      _sum: { liveDuration: true, newFans: true },
    }),
  ]);
  const days = Number(period.to.slice(-2));
  const byDate = new Map(daily.map((row) => [row.date, row.works]));
  return {
    ...totals[0],
    views: Number(totals[0].views),
    recommended: Number(totals[0].recommended),
    anchors,
    liveHours: live._sum.liveDuration ?? 0,
    liveFans: live._sum.newFans ?? 0,
    daily: Array.from({ length: days }, (_, i) => {
      const date = `${period.month}-${String(i + 1).padStart(2, "0")}`;
      return { date, works: byDate.get(date) ?? 0 };
    }),
  };
}

export async function loadReviewOverview(actor: ReviewActor) {
  if (!hasRole(actor.role, "OPERATOR")) throw forbidden();
  const [row] = await prisma.$queryRaw<
    {
      total: number;
      pending: number;
      approved: number;
      rejected: number;
      unassigned: number;
    }[]
  >`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE v."reviewStatus" = 'PENDING')::int AS pending,
      COUNT(*) FILTER (WHERE v."reviewStatus" = 'APPROVED')::int AS approved,
      COUNT(*) FILTER (WHERE v."reviewStatus" = 'REJECTED')::int AS rejected,
      COUNT(*) FILTER (WHERE v."reviewStatus" = 'PENDING' AND NOT EXISTS (
        SELECT 1 FROM "VideoReviewAssignment" a WHERE a."videoId" = v.id
      ))::int AS unassigned
    FROM "VideoStat" v WHERE v.hidden = false
  `;
  return row;
}

export async function loadActivityOverview(now: Date) {
  const today = chinaDateStart(now);
  const specialWhere = { startDate: { lte: today }, endDate: { gte: today } };
  const [specialCount, campaignCount, special, campaigns] = await Promise.all([
    prisma.specialActivity.count({ where: specialWhere }),
    prisma.activity.count({ where: { status: "ONGOING" } }),
    prisma.specialActivity.findMany({
      where: specialWhere,
      orderBy: [{ endDate: "asc" }, { id: "asc" }],
      take: 4,
      select: {
        id: true,
        title: true,
        startDate: true,
        endDate: true,
        settledAt: true,
      },
    }),
    prisma.activity.findMany({
      where: { status: "ONGOING" },
      orderBy: [{ endAt: "asc" }, { id: "asc" }],
      take: 4,
      select: {
        id: true,
        name: true,
        startAt: true,
        endAt: true,
        _count: { select: { enrollments: true } },
      },
    }),
  ]);
  const items = [
    ...special.map((a) => ({
      id: a.id,
      title: a.title,
      type: "专题活动",
      start: a.startDate.toISOString().slice(0, 10),
      end: a.endDate.toISOString().slice(0, 10),
      href: `/operator/special-activities/${a.id}`,
      detail: a.settledAt ? "已结算" : "待结算",
    })),
    ...campaigns.map((a) => ({
      id: a.id,
      title: a.name,
      type: "征稿活动",
      start: chinaDateString(a.startAt),
      end: chinaDateString(a.endAt),
      href: `/operator/activities/${a.id}`,
      detail: `${a._count.enrollments} 人报名`,
    })),
  ]
    .sort((a, b) => a.end.localeCompare(b.end))
    .slice(0, 4);
  return { specialCount, campaignCount, items };
}
