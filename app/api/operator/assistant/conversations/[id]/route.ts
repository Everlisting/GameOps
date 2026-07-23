/**
 * GET /api/operator/assistant/conversations/[id] — 按轮返回某会话(仅本人,OPERATOR)。
 * 每轮含 user 文本 + 所有助手版本 + 当前选中下标(供前端 ‹ › 切换)。
 */
import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { AppError, badRequest } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { conversationPatchSchema } from "@/lib/validation/assistant";
import { getConversationTurns } from "@/lib/assistant/persistence";

export const runtime = "nodejs";

export const GET = route(async (_req, { params }) => {
  const session = await requireRole("OPERATOR");
  const id = params?.id;
  if (!id) throw badRequest("缺少会话 id");
  const conv = await prisma.aiConversation.findFirst({
    where: { id, userId: session.sub },
    select: { id: true },
  });
  if (!conv) throw new AppError("NOT_FOUND", "会话不存在");
  const turns = await getConversationTurns(id);
  return Response.json({ turns });
});

/** 置顶 / 重命名(仅本人)。 */
export const PATCH = route(async (req, { params }) => {
  const session = await requireRole("OPERATOR");
  const id = params?.id;
  if (!id) throw badRequest("缺少会话 id");
  const input = await parseJson(req, conversationPatchSchema);
  const conv = await prisma.aiConversation.findFirst({
    where: { id, userId: session.sub },
    select: { id: true },
  });
  if (!conv) throw new AppError("NOT_FOUND", "会话不存在");
  const data: { pinned?: boolean; title?: string } = {};
  if (input.pinned !== undefined) data.pinned = input.pinned;
  if (input.title !== undefined) data.title = input.title;
  await prisma.aiConversation.update({ where: { id }, data });
  return Response.json({ ok: true });
});

/** 删除会话(仅本人);级联删消息 / 执行 / 工具轨迹。 */
export const DELETE = route(async (_req, { params }) => {
  const session = await requireRole("OPERATOR");
  const id = params?.id;
  if (!id) throw badRequest("缺少会话 id");
  const conv = await prisma.aiConversation.findFirst({
    where: { id, userId: session.sub },
    select: { id: true },
  });
  if (!conv) throw new AppError("NOT_FOUND", "会话不存在");
  await prisma.aiConversation.delete({ where: { id } });
  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "assistant.conversation.delete",
    targetType: "ai_conversation",
    targetId: id,
  });
  return Response.json({ ok: true });
});
