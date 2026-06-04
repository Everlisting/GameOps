/**
 * POST /api/admin/jobs/[id]/trigger — 手动触发一次 Job 执行
 *
 * 鉴权:OPERATOR(运营 + 管理员都能触发)
 * 审计:写一条 task.trigger AuditLog,留人 + 时间 + 参数值快照
 *
 * 入参:{ paramValues: {key: value}, priority?: int }
 *   - paramValues 按 Job.paramSchema 校验
 *   - priority 可选,默认 0;同一 Agent 队列里大的先派
 *
 * 出参:{ id, jobId, agentId, sequenceNumber, status: "PENDING", createdAt }
 */
import type { Prisma } from "@prisma/client";

import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { triggerJobSchema } from "@/lib/validation/job";
import { createTaskFromJob } from "@/lib/jobs";
import { recordAudit } from "@/lib/audit";

export const POST = route(async (req, { params }) => {
  const session = await requireRole("OPERATOR");
  const id = params?.id ?? "";
  const input = await parseJson(req, triggerJobSchema);

  const task = await createTaskFromJob({
    jobId: id,
    paramValues: input.paramValues,
    trigger: "MANUAL",
    createdById: session.sub,
    priority: input.priority,
  });

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "task.trigger",
    targetType: "task",
    targetId: task.id,
    details: {
      jobId: id,
      sequenceNumber: task.sequenceNumber,
      paramValues: input.paramValues,
      priority: input.priority ?? 0,
    } as Prisma.InputJsonValue,
  });

  return Response.json(task, { status: 201 });
});
