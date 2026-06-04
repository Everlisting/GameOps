/**
 * PATCH /api/operator/activities/[id]/status — 切换活动状态
 * 允许转移:DRAFT → ONGOING / ENDED;ONGOING → ENDED;ENDED 终态,不可再变。
 */
import type { ActivityStatus } from "@prisma/client";
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { badRequest, notFound } from "@/lib/errors";
import { activityStatusSchema } from "@/lib/validation/activity";

const ALLOWED: Record<ActivityStatus, ActivityStatus[]> = {
  DRAFT: ["ONGOING", "ENDED"],
  ONGOING: ["ENDED"],
  ENDED: [],
};

export const PATCH = route(async (req, { params }) => {
  await requireRole("OPERATOR");
  const id = params?.id ?? "";
  const { status } = await parseJson(req, activityStatusSchema);

  const a = await prisma.activity.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!a) throw notFound("活动不存在");
  if (a.status === status) return Response.json({ ok: true });
  if (!ALLOWED[a.status].includes(status))
    throw badRequest(`不允许从 ${a.status} 转到 ${status}`);

  await prisma.activity.update({ where: { id }, data: { status } });
  return Response.json({ ok: true });
});
