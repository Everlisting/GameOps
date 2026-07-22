/**
 * POST /api/operator/assistant/feedback — 记录一条回答反馈(点赞/点踩)。OPERATOR。
 */
import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { feedbackSchema } from "@/lib/validation/assistant";

export const runtime = "nodejs";

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
