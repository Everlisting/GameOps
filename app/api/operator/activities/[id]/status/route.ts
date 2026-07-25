/**
 * PATCH /api/operator/activities/[id]/status — 切换活动状态
 * 允许转移:DRAFT → ONGOING;ONGOING → ENDED;ENDED 终态,不可再变。
 * DRAFT → ENDED 已下线 —— 想丢弃草稿走 DELETE /api/operator/activities/[id]。
 */
import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { activityStatusSchema } from "@/lib/validation/activity";
import { changeActivityStatus } from "@/lib/activity/status";

export const PATCH = route(async (req, { params }) => {
  const session = await requireRole("OPERATOR");
  const id = params?.id ?? "";
  const { status } = await parseJson(req, activityStatusSchema);

  await changeActivityStatus(id, status, { id: session.sub, username: session.username });
  return Response.json({ ok: true });
});
