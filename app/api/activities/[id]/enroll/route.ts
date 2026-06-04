/**
 * POST /api/activities/[id]/enroll — 创作者报名活动。
 * 规则:仅 ONGOING 活动可报名;重复报名视为幂等成功。
 */
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/creator";
import { badRequest, notFound } from "@/lib/errors";

export const POST = route(async (_req, { params }) => {
  const id = params?.id ?? "";
  const { creator } = await requireCreator();

  const activity = await prisma.activity.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!activity) throw notFound("活动不存在");
  if (activity.status !== "ONGOING") throw badRequest("该活动当前不开放报名");

  const enrollment = await prisma.activityEnrollment.upsert({
    where: {
      creatorId_activityId: { creatorId: creator.id, activityId: id },
    },
    update: {},
    create: { creatorId: creator.id, activityId: id },
    select: { id: true, createdAt: true },
  });

  return Response.json({ ok: true, enrolledAt: enrollment.createdAt });
});
