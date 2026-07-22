/**
 * GET /api/operator/assistant/conversations/[id] — 某会话的消息(仅本人,OPERATOR)。
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { AppError, badRequest } from "@/lib/errors";
import { prisma } from "@/lib/db";

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
  const messages = await prisma.aiMessage.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  return Response.json({ messages });
});
