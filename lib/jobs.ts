/**
 * Job 执行的共享 helper:被 trigger API / cron scheduler / rerun API 复用。
 *
 * createTaskFromJob:
 *   - 校验 Job 存在且允许当前触发方式
 *   - 校验 paramValues 对照 Job.paramSchema
 *   - 在事务里算出本 Job 的下一个 sequenceNumber(并发安全:用 Job 行级锁)
 *   - 把 Job 当前 revision + 执行配置冻结进 Task,避免排队期间模板被修改后错跑
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
  rerunOfTaskId?: string;
};

export type CreatedTask = {
  id: string;
  jobId: string;
  agentId: string;
  sequenceNumber: number;
  status: "PENDING";
  createdAt: Date;
};

export type JobExecutionSnapshot = {
  id: string;
  name: string;
  revision: number;
  agentId: string;
  repoType: "GIT" | "SVN";
  repoUrl: string;
  repoBranch: string | null;
  workdir: string;
  command: string;
  timeoutMinutes: number;
  paramSchema: Prisma.JsonValue;
  outputs: Prisma.JsonValue;
};

export async function createTaskFromJob(opts: CreateTaskFromJobOpts): Promise<CreatedTask> {
  // 串行化“读配置 + 校验 + 算序号 + 建 Task”。Job 更新同样取得行锁,
  // 因而 jobSnapshot 必然对应一个完整、确定的 revision。
  const created = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "CrawlerJob" WHERE id = ${opts.jobId} FOR UPDATE
    `;
    if (locked.length === 0) throw notFound("Job 不存在");

    const job = await tx.crawlerJob.findUnique({
      where: { id: opts.jobId },
      select: {
        id: true,
        name: true,
        revision: true,
        enabled: true,
        active: true,
        agentId: true,
        repoType: true,
        repoUrl: true,
        repoBranch: true,
        workdir: true,
        command: true,
        timeoutMinutes: true,
        paramSchema: true,
        outputs: true,
      },
    });
    if (!job) throw notFound("Job 不存在");
    if (!job.active) {
      throw conflict("任务已停用,请先在任务列表启用后再运行");
    }
    if (!job.enabled && opts.trigger === "AUTO") {
      throw conflict("Job 的 cron 已关闭,不再自动触发");
    }

    const schema = (job.paramSchema as unknown as ParamSchemaItem[]) ?? [];
    const errors = validateParamValuesAgainstSchema(schema, opts.paramValues);
    if (errors.length > 0) {
      throw badRequest("参数校验失败", errors);
    }

    const last = await tx.crawlerTask.findFirst({
      where: { jobId: job.id },
      orderBy: { sequenceNumber: "desc" },
      select: { sequenceNumber: true },
    });
    const nextSeq = (last?.sequenceNumber ?? 0) + 1;
    const snapshot: JobExecutionSnapshot = {
      id: job.id,
      name: job.name,
      revision: job.revision,
      agentId: job.agentId,
      repoType: job.repoType,
      repoUrl: job.repoUrl,
      repoBranch: job.repoBranch,
      workdir: job.workdir,
      command: job.command,
      timeoutMinutes: job.timeoutMinutes,
      paramSchema: job.paramSchema,
      outputs: job.outputs,
    };

    return tx.crawlerTask.create({
      data: {
        jobId: job.id,
        agentId: job.agentId,
        sequenceNumber: nextSeq,
        paramValues: opts.paramValues as Prisma.InputJsonValue,
        jobRevision: job.revision,
        jobSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        trigger: opts.trigger,
        priority: opts.priority ?? 0,
        status: "PENDING",
        createdById: opts.createdById,
        rerunOfTaskId: opts.rerunOfTaskId,
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

/**
 * 基于已有 Task 创建可复现重跑:
 * - 现代 Task:克隆原 jobSnapshot/jobRevision/agentId/paramValues/sourceRevision
 * - 历史 Task(无快照):兼容性回退到当前 Job,但仍记录 rerunOfTaskId
 * - 当前 Job 的 active 总开关仍生效
 */
export async function createTaskFromFrozenTask(
  sourceTaskId: string,
  createdById: string | null,
): Promise<CreatedTask> {
  const source = await prisma.crawlerTask.findUnique({
    where: { id: sourceTaskId },
    select: {
      id: true,
      jobId: true,
      agentId: true,
      paramValues: true,
      priority: true,
      jobRevision: true,
      jobSnapshot: true,
      sourceRevision: true,
    },
  });
  if (!source) throw notFound("任务不存在");
  if (!source.jobId) {
    throw conflict("该任务没有关联 Job(历史数据),不支持重跑");
  }

  if (!source.jobSnapshot || !source.jobRevision || !source.agentId) {
    return createTaskFromJob({
      jobId: source.jobId,
      paramValues: (source.paramValues as Record<string, unknown>) ?? {},
      trigger: "MANUAL",
      createdById,
      priority: source.priority,
      rerunOfTaskId: source.id,
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "CrawlerJob" WHERE id = ${source.jobId} FOR UPDATE
    `;
    if (locked.length === 0) throw notFound("Job 不存在");

    const job = await tx.crawlerJob.findUnique({
      where: { id: source.jobId! },
      select: { id: true, active: true },
    });
    if (!job) throw notFound("Job 不存在");
    if (!job.active) {
      throw conflict("任务已停用,请先在任务列表启用后再运行");
    }

    const last = await tx.crawlerTask.findFirst({
      where: { jobId: job.id },
      orderBy: { sequenceNumber: "desc" },
      select: { sequenceNumber: true },
    });

    return tx.crawlerTask.create({
      data: {
        jobId: job.id,
        agentId: source.agentId,
        sequenceNumber: (last?.sequenceNumber ?? 0) + 1,
        paramValues: source.paramValues as Prisma.InputJsonValue,
        jobRevision: source.jobRevision,
        jobSnapshot: source.jobSnapshot as Prisma.InputJsonValue,
        sourceRevision: source.sourceRevision,
        rerunOfTaskId: source.id,
        trigger: "MANUAL",
        priority: source.priority,
        status: "PENDING",
        createdById,
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
