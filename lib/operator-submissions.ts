import { Prisma, type SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export type SubmissionSearch = {
  q?: string;
  status?: string;
  platform?: string;
  activityId?: string;
  creatorId?: string;
  from?: string;
  to?: string;
  page?: string;
  pageSize?: string;
  submissionId?: string;
};
export const REVIEW_STATUS_LABELS = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "未通过",
} as const;
export function submissionStatus(
  value: string | undefined,
): SubmissionStatus | undefined {
  return value === "PENDING" || value === "APPROVED" || value === "REJECTED"
    ? value
    : undefined;
}
export function submissionDate(value: string | undefined, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(
    `${value}T${end ? "23:59:59.999" : "00:00:00.000"}+08:00`,
  );
  if (
    !Number.isFinite(date.getTime()) ||
    new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10) !== value
  )
    return undefined;
  return date;
}
export function statPlatform(platform: string) {
  return (
    (
      { 抖音: "douyin", 哔哩哔哩: "bilibili", 小红书: "xiaohongshu" } as Record<
        string,
        string
      >
    )[platform] ?? platform
  );
}
export const submissionSelect = {
  id: true,
  title: true,
  url: true,
  platform: true,
  externalId: true,
  status: true,
  titleStatus: true,
  titleNote: true,
  contentStatus: true,
  contentNote: true,
  yishanStatus: true,
  yishanNote: true,
  createdAt: true,
  activity: { select: { id: true, name: true } },
  reviewTags: { select: { id: true, name: true } },
} satisfies Prisma.SubmissionSelect;

export async function loadSubmissions(
  search: SubmissionSearch,
  review = false,
) {
  const status = submissionStatus(
    search.status ?? (review ? "PENDING" : undefined),
  );
  const q = search.q?.trim() ?? "";
  const from = submissionDate(search.from),
    to = submissionDate(search.to, true);
  const activityId =
    search.activityId === "__none__" ? null : search.activityId || undefined;
  const platform = search.platform?.trim();
  const baseWhere: Prisma.SubmissionWhereInput = {
    ...(search.creatorId ? { creatorId: search.creatorId } : {}),
    ...(activityId !== undefined ? { activityId } : {}),
    ...(platform
      ? {
          platform: {
            in:
              platform === "douyin"
                ? ["douyin", "抖音"]
                : platform === "bilibili"
                  ? ["bilibili", "哔哩哔哩"]
                  : platform === "xiaohongshu"
                    ? ["xiaohongshu", "小红书"]
                    : [platform],
          },
        }
      : {}),
    ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
    ...(q
      ? {
          OR: [
            { id: q },
            { title: { contains: q, mode: "insensitive" } },
            { externalId: { contains: q, mode: "insensitive" } },
            { activity: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const where = { ...baseWhere, ...(status ? { status } : {}) };
  const pageSize = [20, 50, 100].includes(Number(search.pageSize))
    ? Number(search.pageSize)
    : 20;
  const [total, groups, activities] = await Promise.all([
    prisma.submission.count({ where }),
    prisma.submission.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true },
    }),
    prisma.activity.findMany({
      where: { submissions: { some: {} } },
      select: { id: true, name: true },
      orderBy: { startAt: "desc" },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(
    totalPages,
    Math.max(
      1,
      Number.isSafeInteger(Number(search.page)) ? Number(search.page) : 1,
    ),
  );
  const items = await prisma.submission.findMany({
    where,
    select: submissionSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const stats = items.length
    ? await prisma.videoStat.findMany({
        where: {
          hidden: false,
          OR: items
            .filter((item) => item.externalId)
            .map((item) => ({
              platform: statPlatform(item.platform),
              externalId: item.externalId!,
            })),
        },
        select: { platform: true, externalId: true, views: true },
      })
    : [];
  const statMap = new Map(
    stats.map((item) => [`${item.platform}:${item.externalId}`, item.views]),
  );
  const rows = items.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    views:
      statMap.get(`${statPlatform(item.platform)}:${item.externalId}`) ?? null,
  }));
  const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  for (const group of groups) counts[group.status] = group._count._all;
  return {
    rows,
    total,
    counts,
    activities,
    page,
    pageSize,
    totalPages,
    status,
  };
}
