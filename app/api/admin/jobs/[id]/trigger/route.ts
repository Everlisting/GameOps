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
import { buildManualParamDefaults } from "@/lib/job-param-defaults";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { triggerJobSchema, type ParamSchemaItem } from "@/lib/validation/job";
import { createTaskFromJob } from "@/lib/jobs";
import { recordAudit } from "@/lib/audit";

const log = createLogger("job.trigger");

/**
 * 把本次手动触发的标量参数保存到独立 manualParamDefaults,供下次手动表单预填。
 * 不修改 paramSchema.default；后者只属于管理员配置和 cron 自动运行。
 * EXCEL 不长期保存。失败不影响本次 Task 创建。
 */
async function rememberManualParamDefaults(
  jobId: string,
  paramValues: Record<string, unknown>,
): Promise<void> {
  const job = await prisma.crawlerJob.findUnique({
    where: { id: jobId },
    select: { paramSchema: true },
  });
  if (!job) return;
  const schema = (job.paramSchema as unknown as ParamSchemaItem[]) ?? [];
  const remembered = buildManualParamDefaults(schema, paramValues);
  await prisma.crawlerJob.update({
    where: { id: jobId },
    data: { manualParamDefaults: remembered as Prisma.InputJsonValue },
  });
}

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

  // 只更新独立的手动参数记忆，不修改 Job 配置 revision 或 cron 默认值。
  try {
    await rememberManualParamDefaults(id, input.paramValues);
  } catch (err) {
    log.warn("记忆手动参数失败(不影响触发)", { event: "job.trigger.remember_manual_defaults_failed", jobId: id, err });
  }

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
