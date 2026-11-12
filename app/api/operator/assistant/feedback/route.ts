/**
 * POST /api/operator/assistant/feedback — 记录一条回答反馈(点赞/点踩)。OPERATOR。
 * GET  /api/operator/assistant/feedback — 列出全部反馈(含创作者提交的),运营可见。
 */
import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { feedbackSchema } from "@/lib/validation/assistant";

export const runtime = "nodejs";

export const GET = route(async () => {
  await requireRole("OPERATOR");
  const rows = await prisma.aiFeedback.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, rating: true, note: true, conversationId: true, userId: true, createdAt: true },
  });
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, displayName: true, role: true },
  });
  const umap = new Map(users.map((u) => [u.id, u]));
  const feedback = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    note: r.note,
    conversationId: r.conversationId,
    createdAt: r.createdAt,
    username: umap.get(r.userId)?.displayName ?? umap.get(r.userId)?.username ?? r.userId,
    role: umap.get(r.userId)?.role ?? null,
  }));
  return Response.json({ feedback });
});

export const POST = route(async (req) => {
  const session = await requireRole("OPERATOR");
  const input = await parseJson(req, feedbackSchema);
  await prisma.aiFeedback.create({
    data: {
      userId: session.sub,
      conversationId: input.conversationId ?? null,
      clientMessageId: input.clientMessageId ?? null,
      rating: input.rating,
      category: input.category ?? null,
      note: input.note ?? null,
    },
  });
  return Response.json({ ok: true });
});
