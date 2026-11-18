import { parseJson, route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { saveVideoReview } from "@/lib/video-reviews";
import { videoReviewSchema } from "@/lib/validation/video-review";
import { revalidateTag } from "next/cache";

export const PATCH = route(async (req, { params }) => {
  const actor = await requireRole("REVIEWER");
  const patch = await parseJson(req, videoReviewSchema);
  const video = await saveVideoReview(params?.id ?? "", patch, actor);
  revalidateTag("special-activity-estimates");
  return Response.json(video);
});
