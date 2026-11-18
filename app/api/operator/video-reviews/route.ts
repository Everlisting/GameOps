import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { videoReviewListQuerySchema } from "@/lib/validation/video-review";
import { loadVideoReviews } from "@/lib/video-reviews";

export const GET = route(async (req) => {
  const actor = await requireRole("REVIEWER");
  const search = videoReviewListQuerySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  return Response.json(await loadVideoReviews(search, actor));
});
