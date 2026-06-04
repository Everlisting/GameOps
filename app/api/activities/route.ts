/**
 * GET /api/activities — 创作者可见的活动列表
 * 默认只返回 ONGOING(开放报名/投稿);可选 ?status=DRAFT|ONGOING|ENDED
 * 返回字段含 enrolled(当前创作者是否已报名)。
 */
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/creator";
import { activityListQuerySchema } from "@/lib/validation/activity";

export const GET = route(async (req) => {
  const { creator } = await requireCreator();
  const url = new URL(req.url);
  const { status } = activityListQuerySchema.parse(
    Object.fromEntries(url.searchParams),
  );

  const activities = await prisma.activity.findMany({
    where: status ? { status } : { status: { in: ["ONGOING", "ENDED"] } },
    orderBy: [{ status: "asc" }, { startAt: "desc" }],
    select: {
      id: true,
      name: true,
      description: true,
      coverImage: true,
      status: true,
      startAt: true,
      endAt: true,
      _count: { select: { submissions: true, enrollments: true } },
      enrollments: {
        where: { creatorId: creator.id },
        select: { id: true },
        take: 1,
      },
    },
  });

  return Response.json({
    items: activities.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      coverImage: a.coverImage,
      status: a.status,
      startAt: a.startAt,
      endAt: a.endAt,
      submissionCount: a._count.submissions,
      enrollmentCount: a._count.enrollments,
      enrolled: a.enrollments.length > 0,
    })),
  });
});
