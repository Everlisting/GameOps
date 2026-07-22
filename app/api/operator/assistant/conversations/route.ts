/**
 * GET /api/operator/assistant/conversations — 本人最近会话列表(OPERATOR)。
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export const GET = route(async () => {
  const session = await requireRole("OPERATOR");
  const conversations = await prisma.aiConversation.findMany({
    where: { userId: session.sub, status: "active" },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true },
  });
  return Response.json({ conversations });
});
