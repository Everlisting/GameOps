/**
 * GET /api/creator/assistant/conversations — 本人创作者对话历史(仅近 1 月)。
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export const GET = route(async () => {
  const session = await requireRole("CREATOR");
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const conversations = await prisma.aiConversation.findMany({
    where: { userId: session.sub, audience: "creator", status: "active", updatedAt: { gte: monthAgo } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true },
  });
  return Response.json({ conversations });
});
