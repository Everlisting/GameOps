/**
 * PATCH /api/operator/incentives/[id] — 人工调整单条激励。
 *
 * body:{ adjusted: number | null, reason?: string }
 *   adjusted=number → 锁定金额(以此发结算)
 *   adjusted=null   → 撤销调整,回退到 estimated
 *
 * 写 AuditLog(action="incentive.adjust",details 装活动 / 创作者 / 前后值 / 原因)
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { badRequest, notFound } from "@/lib/errors";
import { incentiveAdjustSchema } from "@/lib/validation/incentive";
import { incentiveDb } from "@/lib/incentive/db";
import { recordAudit } from "@/lib/audit";

export const PATCH = route(async (req, { params }) => {
  const session = await requireRole("OPERATOR");
  const id = params?.id ?? "";
  if (!id) throw badRequest("缺少激励 id");

  const body = await parseJson(req, incentiveAdjustSchema);

  const existing = await incentiveDb.findUnique({ where: { id } });
  if (!existing) throw notFound("激励记录不存在");

  const before = {
    adjusted: existing.adjusted == null ? null : Number(existing.adjusted),
    reason: existing.adjustReason,
  };
  const estimated = Number(existing.estimated);

  const updated = await incentiveDb.update({
    where: { id },
    data: {
      adjusted: body.adjusted,
      adjustReason: body.adjusted == null ? null : body.reason,
      adjustedById: body.adjusted == null ? null : session.sub,
      adjustedAt: body.adjusted == null ? null : new Date(),
    },
  });

  // 关联活动/创作者信息进 audit
  const [activity, creator] = await Promise.all([
    prisma.activity.findUnique({
      where: { id: existing.activityId },
      select: { name: true },
    }),
    prisma.creator.findUnique({
      where: { id: existing.creatorId },
      select: { nickname: true },
    }),
  ]);

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "incentive.adjust",
    targetType: "incentive",
    targetId: id,
    details: {
      activityId: existing.activityId,
      activityName: activity?.name ?? null,
      creatorId: existing.creatorId,
      creatorNickname: creator?.nickname ?? null,
      estimated,
      before,
      after: {
        adjusted: body.adjusted,
        reason: body.adjusted == null ? null : body.reason,
      },
    },
  });

  return Response.json({
    ok: true,
    item: {
      id: updated.id,
      adjusted: updated.adjusted == null ? null : Number(updated.adjusted),
      adjustReason: updated.adjustReason,
      adjustedAt: updated.adjustedAt ? updated.adjustedAt.toISOString() : null,
    },
  });
});
