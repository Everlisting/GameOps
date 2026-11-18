import { parseJson, route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { submissionPeriodSchema } from "@/lib/validation/submission-period";
import { saveSubmissionPeriod } from "@/lib/submission-periods";
import { badRequest } from "@/lib/errors";

export const PATCH = route(async (req, { params }) => {
  const actor = await requireRole("OPERATOR");
  const input = await parseJson(req, submissionPeriodSchema);
  if (!params?.id) throw badRequest("请选择要编辑的稿件统计。");
  return Response.json(await saveSubmissionPeriod(input, actor, params.id));
});
