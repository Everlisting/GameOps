/**
 * GET /api/creator/assistant/conversations/[id] — 某创作者对话的消息(仅本人)。
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { AppError, badRequest } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { getConversationTurns } from "@/lib/assistant/persistence";

export const runtime = "nodejs";

export const GET = route(async (_req, { params }) => {
  const session = await requireRole("CREATOR");
  const id = params?.id;
  if (!id) throw badRequest("缺少会话 id");
  const conv = await prisma.aiConversation.findFirst({
    where: { id, userId: session.sub, audience: "creator" },
    select: { id: true },
  });
  if (!conv) throw new AppError("NOT_FOUND", "会话不存在");
  const turns = await getConversationTurns(id);
  return Response.json({ turns });
});
