/**
 * POST /api/activities/[id]/enroll — 创作者报名活动。
 * 规则:仅 ONGOING 活动可报名;重复报名视为幂等成功。
 */
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/creator";
import { badRequest, notFound } from "@/lib/errors";
import { autoTransitionActivities } from "@/lib/activity-publish";

export const POST = route(async (_req, { params }) => {
  const id = params?.id ?? "";
  const { creator } = await requireCreator();

  // 状态守卫前先跑一次自动转移,避免创作者绕过列表页直接 POST 到 endAt 已到点的 ONGOING 活动
  await autoTransitionActivities();

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
