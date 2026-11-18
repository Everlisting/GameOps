import { parseJson, route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { badRequest } from "@/lib/errors";
import { reviewAssignmentSchema } from "@/lib/validation/review-assignment";
import { assignPeriodReviews } from "@/lib/review-assignments";

export const POST = route(async (req, { params }) => {
  const actor = await requireRole("OPERATOR");
  if (!params?.id) throw badRequest("请选择要分配的统计周期。");
  const input = await parseJson(req, reviewAssignmentSchema);
  return Response.json(await assignPeriodReviews(params.id, input, actor));
});
