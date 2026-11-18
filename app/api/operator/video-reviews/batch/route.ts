import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { notFound } from "@/lib/errors";

export const POST = route(async () => {
  await requireRole("REVIEWER");
  throw notFound("批量审核已停用，请逐条审核稿件。");
});
