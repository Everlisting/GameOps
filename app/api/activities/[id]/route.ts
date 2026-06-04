/**
 * GET /api/activities/[id] — 活动详情(含当前创作者的报名、投稿)。
 */
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/creator";
import { notFound } from "@/lib/errors";

export const GET = route(async (_req, { params }) => {
  const id = params?.id ?? "";
  const { creator } = await requireCreator();

  const activity = await prisma.activity.findUnique({
    where: { id },
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
        select: { id: true, createdAt: true },
        take: 1,
      },
      submissions: {
        where: { creatorId: creator.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          url: true,
          platform: true,
          status: true,
          reviewNote: true,
          createdAt: true,
        },
      },
    },
  });

  if (!activity) throw notFound("活动不存在");

  return Response.json({
    id: activity.id,
    name: activity.name,
    description: activity.description,
    coverImage: activity.coverImage,
    status: activity.status,
    startAt: activity.startAt,
    endAt: activity.endAt,
    submissionCount: activity._count.submissions,
    enrollmentCount: activity._count.enrollments,
    enrolled: activity.enrollments.length > 0,
    enrolledAt: activity.enrollments[0]?.createdAt ?? null,
    mySubmissions: activity.submissions,
  });
});
