/**
 * POST /api/operator/assistant/approvals/[id]/decision — 批准 / 拒绝一条待审批写操作。
 *
 * 幂等 & 防并发:用 updateMany(where status='pending')原子领取,count=0 视为已被处理 → 409。
 * 批准后由执行器注册表幂等执行现有业务逻辑;成功 executed / 失败 failed(错误留档)。
 * 全程审计:approval.approve / approval.reject + 底层业务审计(如 incentive.compute,在执行器内写)。
 */
import type { Prisma } from "@prisma/client";

import { route, parseJson } from "@/lib/api";
import { requireRole, hasRole } from "@/lib/rbac";
import { badRequest, notFound, conflict, forbidden } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { approvalDecisionSchema } from "@/lib/validation/assistant";
import { approvalDb, serializeApproval } from "@/lib/assistant/approvals/db";
import { getApprovalHandler } from "@/lib/assistant/approvals/registry";

export const runtime = "nodejs";

export const POST = route(async (req, { params }) => {
  const session = await requireRole("OPERATOR");
  const id = params?.id ?? "";
  if (!id) throw badRequest("缺少审批 id");
  const { decision } = await parseJson(req, approvalDecisionSchema);

  const approval = await approvalDb.findUnique({ where: { id } });
  if (!approval) throw notFound("审批不存在");

  const handler = getApprovalHandler(approval.action);
  if (!handler) throw badRequest(`未注册的审批动作:${approval.action}`);
  // 二次 RBAC:按动作要求的最小角色兜底(为未来 ADMIN 专属动作留口)
  if (!hasRole(session.role, handler.requiredRole)) throw forbidden("你的角色无权审批此操作");

  // 原子领取:仅当仍为 pending 时置 approved/rejected;否则说明已被处理
  const nextStatus = decision === "approve" ? "approved" : "rejected";
  const claim = await approvalDb.updateMany({
    where: { id, status: "pending" },
    data: {
      status: nextStatus,
      decidedById: session.sub,
      decidedByName: session.displayName ?? session.username,
      decidedAt: new Date(),
    },
  });
  if (claim.count === 0) throw conflict("该操作已被处理(可能已被批准/拒绝或执行过)");

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: decision === "approve" ? "approval.approve" : "approval.reject",
    targetType: "ai_approval",
    targetId: id,
    details: { action: approval.action, title: approval.title } as Prisma.InputJsonValue,
  });

  if (decision === "reject") {
    const row = await approvalDb.findUnique({ where: { id } });
    return Response.json({ ok: true, approval: row ? serializeApproval(row) : null });
  }

  // 批准 → 执行(幂等,失败留档)
  try {
    const result = await handler.execute(approval.params, {
      id: session.sub,
      username: session.username,
    });
    await approvalDb.update({
      where: { id },
      data: {
        status: "executed",
        result: result as Prisma.InputJsonValue,
        executedAt: new Date(),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await approvalDb.update({ where: { id }, data: { status: "failed", errorMessage: msg } });
    const row = await approvalDb.findUnique({ where: { id } });
    return Response.json(
      { ok: false, error: msg, approval: row ? serializeApproval(row) : null },
      { status: 200 },
    );
  }

  const row = await approvalDb.findUnique({ where: { id } });
  return Response.json({ ok: true, approval: row ? serializeApproval(row) : null });
});
