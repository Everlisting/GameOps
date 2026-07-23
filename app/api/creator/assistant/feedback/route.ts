/**
 * POST /api/creator/assistant/feedback — 创作者提交反馈(评分或文本),运营端可见。
 */
import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { creatorFeedbackSchema } from "@/lib/validation/assistant";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const session = await requireRole("CREATOR");
  const input = await parseJson(req, creatorFeedbackSchema);
  await prisma.aiFeedback.create({
    data: {
      userId: session.sub,
      conversationId: input.conversationId ?? null,
      rating: input.rating ?? null,
      note: input.note ?? null,
    },
  });
  return Response.json({ ok: true });
});
