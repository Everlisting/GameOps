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
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { triggerJobSchema, type ParamSchemaItem } from "@/lib/validation/job";
import { createTaskFromJob } from "@/lib/jobs";
import { recordAudit } from "@/lib/audit";

/**
 * 把本次触发填的参数值写回 Job.paramSchema 的 default,下次触发自动预填。
 * 主要为 cookie 这类"填一次、长期复用、过期才换"的参数省去每次重填。
 * 只记标量(string / number)非空值;EXCEL 不支持 default,跳过。失败不影响触发。
 */
async function rememberParamDefaults(
  jobId: string,
  paramValues: Record<string, unknown>,
): Promise<void> {
  const job = await prisma.crawlerJob.findUnique({
    where: { id: jobId },
    select: { paramSchema: true },
  });
  if (!job) return;
  const schema = (job.paramSchema as unknown as ParamSchemaItem[]) ?? [];
  let changed = false;
  const next = schema.map((item) => {
    if (item.type === "EXCEL") return item;
    const v = paramValues[item.name];
    const scalar = (typeof v === "string" && v !== "") || typeof v === "number";
    if (scalar && item.default !== v) {
      changed = true;
      return { ...item, default: v as string | number };
    }
    return item;
  });
  if (changed) {
    await prisma.crawlerJob.update({
      where: { id: jobId },
      data: { paramSchema: next as unknown as Prisma.InputJsonValue },
    });
  }
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

  // 记住本次参数值作为默认(cookie 等长期复用、过期才换),失败不影响触发
  try {
    await rememberParamDefaults(id, input.paramValues);
  } catch (err) {
    console.error("[trigger] 记忆参数默认值失败", err);
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
