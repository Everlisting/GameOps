/**
 * POST /api/operator/assistant/messages/activate — 切换某轮当前选中的助手版本(OPERATOR)。
 */
import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { badRequest } from "@/lib/errors";
import { activateSchema } from "@/lib/validation/assistant";
import { activateVariant } from "@/lib/assistant/persistence";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const session = await requireRole("OPERATOR");
  const { messageId } = await parseJson(req, activateSchema);
  const ok = await activateVariant(session.sub, messageId);
  if (!ok) throw badRequest("无效的消息或无权操作");
  return Response.json({ ok: true });
});
