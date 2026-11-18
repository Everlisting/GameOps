import { parseJson, route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { submissionPeriodSchema } from "@/lib/validation/submission-period";
import { saveSubmissionPeriod } from "@/lib/submission-periods";

export const POST = route(async (req) => {
  const actor = await requireRole("OPERATOR");
  const input = await parseJson(req, submissionPeriodSchema);
  return Response.json(await saveSubmissionPeriod(input, actor), { status: 201 });
});
