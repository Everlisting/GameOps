/**
 * GET    /api/opinion/tasks/[id] — 报告任务详情(OPERATOR+)
 * DELETE /api/opinion/tasks/[id] — 删除任务和产物(ADMIN only)
 *
 * DELETE 会同时:
 *   - 分析服务侧:删 SQLite row + volume 产物
 *   - 审计:opinion.delete
 */
import type { Prisma } from "@prisma/client";

import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { deleteTask, getTask } from "@/lib/opinion/client";
import { removeTaskDir } from "@/lib/opinion/storage";

export const GET = route(async (_req, { params }) => {
  await requireRole("OPERATOR");
  const id = params?.id ?? "";
  const info = await getTask(id);
  return Response.json(info);
});

export const DELETE = route(async (_req, { params }) => {
  const session = await requireRole("ADMIN");
  const id = params?.id ?? "";
  const info = await getTask(id); // 拿元数据落审计;不存在会 404
  await deleteTask(id);
  removeTaskDir(id); // 中台 storage 侧一并清

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "opinion.delete",
    targetType: "opinion_task",
    targetId: id,
    details: {
      scope: info.scope,
      game: info.game,
      status: info.status,
    } as Prisma.InputJsonValue,
  });

  return new Response(null, { status: 204 });
});
