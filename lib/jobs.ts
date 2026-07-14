/**
 * Job 执行的共享 helper:被 trigger API / cron scheduler / rerun API 复用。
 *
 * createTaskFromJob:
 *   - 校验 Job 存在且 enabled
 *   - 校验 paramValues 对照 Job.paramSchema
 *   - 在事务里算出本 Job 的下一个 sequenceNumber(并发安全:用 Job 行级锁)
 *   - 写一条 CrawlerTask(status=PENDING、agentId 从 Job 继承)
 */
import { prisma } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/errors";
import {
  validateParamValuesAgainstSchema,
  type ParamSchemaItem,
} from "@/lib/validation/job";
import type { CrawlerTaskTrigger, Prisma } from "@prisma/client";

export type CreateTaskFromJobOpts = {
  jobId: string;
  paramValues: Record<string, unknown>;
  trigger: CrawlerTaskTrigger;
  createdById: string | null; // AUTO(cron)时为 null
  priority?: number;
};

export type CreatedTask = {
  id: string;
  jobId: string;
  agentId: string;
  sequenceNumber: number;
  status: "PENDING";
  createdAt: Date;
};

export async function createTaskFromJob(opts: CreateTaskFromJobOpts): Promise<CreatedTask> {
  const job = await prisma.crawlerJob.findUnique({
    where: { id: opts.jobId },
    select: {
      id: true,
      enabled: true,
      active: true,
      agentId: true,
      paramSchema: true,
    },
  });
  if (!job) throw notFound("Job 不存在");
  // active = 任务整体启停,停用后任何方式都不可触发(手动 / rerun / cron)。
  if (!job.active) {
    throw conflict("任务已停用,请先在任务列表启用后再运行");
  }
  // enabled 只控制 cron 自动触发(AUTO)。手动触发(MANUAL / rerun)即使 cron 关着也允许,
  // 方便临时关掉定时但偶尔手工补数据。
  if (!job.enabled && opts.trigger === "AUTO") {
    throw conflict("Job 的 cron 已关闭,不再自动触发");
  }

  // paramValues 对照 Job 的 paramSchema 校验
  const schema = (job.paramSchema as unknown as ParamSchemaItem[]) ?? [];
  const errors = validateParamValuesAgainstSchema(schema, opts.paramValues);
  if (errors.length > 0) {
    throw badRequest("参数校验失败", errors);
  }

  // 串行化"算 sequenceNumber + 写 task":用事务 + Job 行锁
  // (Postgres 默认 READ COMMITTED 下 SELECT FOR UPDATE 即可串行化同 Job 的并发 trigger)
  const created = await prisma.$transaction(async (tx) => {
    // 取本 Job 当前最大 sequenceNumber(只数 jobId 匹配的);锁 Job 行避免并发重复
    await tx.$executeRaw`SELECT id FROM "CrawlerJob" WHERE id = ${job.id} FOR UPDATE`;
    const last = await tx.crawlerTask.findFirst({
      where: { jobId: job.id },
      orderBy: { sequenceNumber: "desc" },
      select: { sequenceNumber: true },
    });
    const nextSeq = (last?.sequenceNumber ?? 0) + 1;

    return tx.crawlerTask.create({
      data: {
        jobId: job.id,
        agentId: job.agentId,
        sequenceNumber: nextSeq,
        paramValues: opts.paramValues as Prisma.InputJsonValue,
        trigger: opts.trigger,
        priority: opts.priority ?? 0,
        status: "PENDING",
        createdById: opts.createdById,
      },
      select: {
        id: true,
        jobId: true,
        agentId: true,
        sequenceNumber: true,
        status: true,
        createdAt: true,
      },
    });
  });

  return {
    id: created.id,
    jobId: created.jobId!,
    agentId: created.agentId!,
    sequenceNumber: created.sequenceNumber!,
    status: "PENDING",
    createdAt: created.createdAt,
  };
}

/** 渲染命令模板 {{var}} → 实际值。所有值用 String() 序列化。支持 Unicode(含中文)参数名。 */
export function renderCommand(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\p{L}_][\p{L}\p{N}_]*)\s*\}\}/gu, (_match, name: string) => {
    const v = values[name];
    return v === undefined || v === null ? "" : String(v);
  });
}
