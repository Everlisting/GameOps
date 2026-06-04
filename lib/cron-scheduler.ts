/**
 * Cron 调度器:维护一个内存 Map<jobId, node-cron 任务>,到点自动建 PENDING Task。
 *
 * 启动入口:instrumentation.ts(Node runtime,Next.js 进程级)。
 *
 * 同步策略(增量):
 *   - start():进程首次启动时扫所有 enabled + 有 cronExpression 的 Job 注册一遍
 *   - syncJob(jobId):Job CRUD 后调,负责"注册 / 更新 / 移除"该 Job 的定时
 *   - removeJob(jobId):Job 删除时调
 *
 * 多实例部署提示(MVP 暂不处理):中台是单进程时安全;多实例上线后需要在
 * createTaskFromJob 之前加 Postgres advisory lock,避免每实例都建一条同周期的 task。
 */
import cron from "node-cron";

import { prisma } from "@/lib/db";
import { createTaskFromJob } from "@/lib/jobs";
import { isValidCronExpression } from "@/lib/validation/job";

type ScheduledEntry = {
  task: cron.ScheduledTask;
  cronExpression: string;
};

const scheduled = new Map<string, ScheduledEntry>();
let started = false;

/** 进程启动时扫一遍所有需要定时的 Job。多次调用幂等。 */
export async function start(): Promise<void> {
  if (started) return;
  started = true;

  const jobs = await prisma.crawlerJob.findMany({
    where: { enabled: true, NOT: { cronExpression: null } },
    select: { id: true },
  });
  for (const j of jobs) {
    try {
      await syncJob(j.id);
    } catch (err) {
      console.error("[cron-scheduler] syncJob 失败", j.id, err);
    }
  }
  console.info("[cron-scheduler] started, jobs=", scheduled.size);
}

/**
 * 增量同步:根据 DB 当前状态决定该 Job 的定时是 "新注册 / 改 / 取消":
 *   - enabled=false 或 cronExpression=null → 取消
 *   - cronExpression 变了 → 替换
 *   - 一致 → 不动
 */
export async function syncJob(jobId: string): Promise<void> {
  const job = await prisma.crawlerJob.findUnique({
    where: { id: jobId },
    select: { id: true, name: true, enabled: true, cronExpression: true },
  });

  const existing = scheduled.get(jobId);

  if (!job || !job.enabled || !job.cronExpression) {
    if (existing) {
      existing.task.stop();
      scheduled.delete(jobId);
      console.info("[cron-scheduler] unscheduled job=", jobId);
    }
    return;
  }

  if (!isValidCronExpression(job.cronExpression)) {
    console.warn("[cron-scheduler] cron 表达式非法,跳过 job=", jobId, job.cronExpression);
    if (existing) {
      existing.task.stop();
      scheduled.delete(jobId);
    }
    return;
  }

  // 表达式一致则不动
  if (existing && existing.cronExpression === job.cronExpression) return;

  if (existing) existing.task.stop();

  const task = cron.schedule(
    job.cronExpression,
    () => {
      void fireJob(jobId, job.name);
    },
    { scheduled: true, timezone: "Asia/Shanghai" },
  );
  scheduled.set(jobId, { task, cronExpression: job.cronExpression });
  console.info(
    "[cron-scheduler] scheduled job=",
    jobId,
    "name=",
    job.name,
    "cron=",
    job.cronExpression,
  );
}

export async function removeJob(jobId: string): Promise<void> {
  const e = scheduled.get(jobId);
  if (e) {
    e.task.stop();
    scheduled.delete(jobId);
    console.info("[cron-scheduler] removed job=", jobId);
  }
}

/** Cron 回调:走 createTaskFromJob,paramValues 用 paramSchema 的 default 字段填。 */
async function fireJob(jobId: string, name: string): Promise<void> {
  try {
    const job = await prisma.crawlerJob.findUnique({
      where: { id: jobId },
      select: { paramSchema: true, enabled: true },
    });
    if (!job || !job.enabled) return; // 已停用,跳过

    const schema = (job.paramSchema as unknown as Array<{
      name: string;
      default?: unknown;
    }>) ?? [];
    const paramValues: Record<string, unknown> = {};
    for (const item of schema) {
      if (item.default !== undefined) paramValues[item.name] = item.default;
    }

    const task = await createTaskFromJob({
      jobId,
      paramValues,
      trigger: "AUTO",
      createdById: null,
    });
    console.info(
      "[cron-scheduler] fired job=",
      jobId,
      "name=",
      name,
      "task=",
      task.id,
      "seq=",
      task.sequenceNumber,
    );
  } catch (err) {
    console.error("[cron-scheduler] fire 失败 job=", jobId, err);
  }
}

/** 给 UI / 编辑页用:不会改变内存状态。 */
export async function getNextRunAt(cronExpression: string): Promise<Date | null> {
  if (!isValidCronExpression(cronExpression)) return null;
  try {
    const { default: cronParser } = await import("cron-parser");
    const it = cronParser.parseExpression(cronExpression, { tz: "Asia/Shanghai" });
    return it.next().toDate();
  } catch {
    return null;
  }
}
