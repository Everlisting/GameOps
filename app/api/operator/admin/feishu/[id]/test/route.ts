/**
 * POST /api/operator/admin/feishu/[id]/test — 向该群发连通性测试消息(ADMIN)
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { badRequest, notFound } from "@/lib/errors";
import { getWebhookTarget } from "@/lib/feishu/config";
import { sendTestMessage } from "@/lib/feishu/send";

export const runtime = "nodejs";

export const POST = route(async (_req, { params }) => {
  const session = await requireRole("ADMIN");
  const id = params?.id ?? "";
  if (!id) throw badRequest("缺少 id");
  const target = await getWebhookTarget(id);
  if (!target) throw notFound("webhook 不存在");
  const r = await sendTestMessage(target, { id: session.sub, username: session.username });
  return Response.json({ ok: r.ok, msg: r.msg });
});
