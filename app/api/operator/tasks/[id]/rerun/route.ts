/**
 * POST /api/operator/tasks/[id]/rerun — 运营/管理员把已有任务再触发一次
 *
 * 鉴权:OPERATOR
 *
 * 重构后语义:基于原 Task 的 jobId + paramValues,通过 Job trigger 流程建一条新 Task。
 *   - 原 Task 保留(状态 / 日志不动)
 *   - 新 Task 走 createTaskFromJob,共享 sequenceNumber 分配与参数校验
 *   - 历史任务(无 jobId)拒绝重跑
 */
import type { Prisma } from "@prisma/client";

import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { conflict, notFound } from "@/lib/errors";
import { createTaskFromJob } from "@/lib/jobs";
import { recordAudit } from "@/lib/audit";

export const POST = route(async (_req, { params }) => {
  const session = await requireRole("OPERATOR");
  const id = params?.id ?? "";

  const src = await prisma.crawlerTask.findUnique({
    where: { id },
    select: {
      jobId: true,
      paramValues: true,
      priority: true,
    },
  });
  if (!src) throw notFound("任务不存在");
  if (!src.jobId)
    throw conflict("该任务没有关联 Job(历史数据),不支持重跑");

  const created = await createTaskFromJob({
    jobId: src.jobId,
    paramValues: (src.paramValues as Record<string, unknown>) ?? {},
    trigger: "MANUAL",
    createdById: session.sub,
    priority: src.priority,
  });

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "task.rerun",
    targetType: "task",
    targetId: created.id,
    details: {
      sourceTaskId: id,
      jobId: src.jobId,
      paramValues: src.paramValues,
    } as Prisma.InputJsonValue,
  });

  return Response.json(created, { status: 201 });
});
