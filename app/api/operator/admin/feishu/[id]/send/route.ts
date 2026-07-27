/**
 * POST /api/operator/admin/feishu/[id]/send — 立即向该群发送运营数据日报(ADMIN)
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { badRequest, notFound } from "@/lib/errors";
import { getWebhookTarget } from "@/lib/feishu/config";
import { sendDailyReport } from "@/lib/feishu/send";

export const runtime = "nodejs";

export const POST = route(async (_req, { params }) => {
  const session = await requireRole("ADMIN");
  const id = params?.id ?? "";
  if (!id) throw badRequest("缺少 id");
  const target = await getWebhookTarget(id);
  if (!target) throw notFound("webhook 不存在");
  const r = await sendDailyReport(target, { id: session.sub, username: session.username });
  return Response.json({ ok: r.ok, msg: r.msg });
});
