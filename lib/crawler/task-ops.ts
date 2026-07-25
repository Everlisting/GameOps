/**
 * 采集任务的可复用操作(重跑 / 取消),供运营端 route 与「审批执行器」(阶段10.4)共用。
 * 从原 route 抽出,保证审批触发与手动操作走同一套业务规则 + 审计。
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { createTaskFromJob } from "@/lib/jobs";

export interface TaskActor {
  id: string | null; // 操作人 user.id;null=系统
  username: string;
}

/** 往 task 日志文件末尾追加 server 侧 marker(取消 / 重排队等)。文件不存在 / IO 失败静默吞掉。 */
export async function appendTaskLogMarker(logPath: string | null, line: string): Promise<void> {
  if (!logPath) return;
  try {
    const abs = path.join(process.cwd(), logPath);
    // 防越权:logPath 必须仍在 data/logs/ 下
    const allowed = path.resolve(process.cwd(), "data", "logs");
    if (!path.resolve(abs).startsWith(allowed + path.sep)) return;
    await fs.appendFile(abs, line.endsWith("\n") ? line : line + "\n", "utf8");
  } catch {
    // 静默忽略
  }
}

/** 取消一条采集任务(状态机 + 日志 marker + 审计 task.cancel)。幂等:已 CANCELED 直接返回。 */
export async function cancelCrawlerTask(
  taskId: string,
  actor: TaskActor,
): Promise<{ fromStatus: string }> {
  const t = await prisma.crawlerTask.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, logPath: true },
  });
  if (!t) throw notFound("任务不存在");
  if (t.status === "SUCCEEDED") throw conflict("已完成任务不能取消");
  if (t.status === "CANCELED") return { fromStatus: t.status };

  const wasRunning = t.status === "RUNNING";
  await prisma.crawlerTask.update({
    where: { id: t.id },
    data: { status: "CANCELED", finishedAt: new Date() },
  });
  await appendTaskLogMarker(
    t.logPath,
    `\n[server] ${new Date().toISOString()} 任务被 ${actor.username} 取消` +
      (wasRunning ? ",Agent 将在数秒内 kill 子进程" : "") +
      "\n",
  );
  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "task.cancel",
    targetType: "task",
    targetId: t.id,
    details: { fromStatus: t.status },
  });
  return { fromStatus: t.status };
}

/** 重跑一条采集任务:基于原 Task 的 jobId+参数克隆一条新 PENDING 任务(原任务不动),审计 task.rerun。 */
export async function rerunCrawlerTask(
  taskId: string,
  actor: TaskActor,
): Promise<{ newTaskId: string; sourceTaskId: string; jobId: string }> {
  const src = await prisma.crawlerTask.findUnique({
    where: { id: taskId },
    select: { jobId: true, paramValues: true, priority: true },
  });
  if (!src) throw notFound("任务不存在");
  if (!src.jobId) throw conflict("该任务没有关联 Job(历史数据),不支持重跑");

  const created = await createTaskFromJob({
    jobId: src.jobId,
    paramValues: (src.paramValues as Record<string, unknown>) ?? {},
    trigger: "MANUAL",
    createdById: actor.id,
    priority: src.priority,
  });

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "task.rerun",
    targetType: "task",
    targetId: created.id,
    details: { sourceTaskId: taskId, jobId: src.jobId, paramValues: src.paramValues },
  });

  return { newTaskId: created.id, sourceTaskId: taskId, jobId: src.jobId };
}
