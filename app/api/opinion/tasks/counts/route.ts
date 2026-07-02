/**
 * GET /api/opinion/tasks/counts?scope=X — 4 态计数 + total
 *
 * 鉴权:OPERATOR+(和列表一样)。
 * 供列表页顶部的统计卡片用。
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { getTaskCounts } from "@/lib/opinion/client";

export const GET = route(async (req) => {
  await requireRole("OPERATOR");
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? undefined;
  const counts = await getTaskCounts(scope);
  return Response.json(counts);
});
