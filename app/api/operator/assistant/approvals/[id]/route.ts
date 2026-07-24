/**
 * GET /api/operator/assistant/approvals/[id] — 单条审批当前状态(内联审批卡片挂载时读)。
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { badRequest, notFound } from "@/lib/errors";
import { approvalDb, serializeApproval } from "@/lib/assistant/approvals/db";

export const runtime = "nodejs";

export const GET = route(async (_req, { params }) => {
  await requireRole("OPERATOR");
  const id = params?.id ?? "";
  if (!id) throw badRequest("缺少审批 id");
  const row = await approvalDb.findUnique({ where: { id } });
  if (!row) throw notFound("审批不存在");
  return Response.json({ approval: serializeApproval(row) });
});
