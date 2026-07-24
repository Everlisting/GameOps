/**
 * GET /api/operator/assistant/approvals — 待审批 / 近期审批列表(运营)。
 *   ?status=pending(默认,仅待办)| all(近 50 条)
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { approvalDb, serializeApproval } from "@/lib/assistant/approvals/db";

export const runtime = "nodejs";

export const GET = route(async (req) => {
  await requireRole("OPERATOR");
  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  const where = status === "all" ? {} : { status };
  const rows = await approvalDb.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return Response.json({ approvals: rows.map(serializeApproval) });
});
