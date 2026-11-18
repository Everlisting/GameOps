import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { videoReviewQueueQuerySchema } from "@/lib/validation/video-review";
import { nextVideoReview } from "@/lib/video-reviews";

export const GET = route(async (req) => {
  const actor = await requireRole("REVIEWER");
  const { afterId, ...search } = videoReviewQueueQuerySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  return Response.json({ video: await nextVideoReview(search, afterId, actor) });
});
