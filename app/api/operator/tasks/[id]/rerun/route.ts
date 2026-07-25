/**
 * POST /api/operator/tasks/[id]/rerun — 运营/管理员把已有任务再触发一次
 *
 * 鉴权:OPERATOR。业务逻辑复用 lib/crawler/task-ops.ts 的 rerunCrawlerTask
 * (与阶段10.4 审批执行器共用:基于原 Task 的 jobId+参数克隆新 PENDING 任务,原任务不动,审计 task.rerun)。
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { rerunCrawlerTask } from "@/lib/crawler/task-ops";

export const POST = route(async (_req, { params }) => {
  const session = await requireRole("OPERATOR");
  const id = params?.id ?? "";

  const { newTaskId } = await rerunCrawlerTask(id, {
    id: session.sub,
    username: session.username,
  });

  return Response.json({ id: newTaskId }, { status: 201 });
});
