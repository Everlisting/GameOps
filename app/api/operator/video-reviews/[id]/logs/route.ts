import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { loadVideoReviewHistory } from "@/lib/video-review-history";
import { videoReviewHistoryQuerySchema } from "@/lib/validation/video-review-history";

export const GET = route(async (req, { params }) => {
  const actor = await requireRole("OPERATOR");
  const { page } = videoReviewHistoryQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return Response.json(await loadVideoReviewHistory(params?.id ?? "", page, actor), { headers: { "Cache-Control": "private, no-store" } });
});
