/**
 * GET    /api/admin/tasks/[id] — Task 详情(含 job 信息、参数、产物列表)
 * PATCH  /api/admin/tasks/[id] — 取消(status=CANCELED) / 重排队(status=PENDING) / 调优先级
 * DELETE /api/admin/tasks/[id] — 删除任务记录(RUNNING 时拒绝)
 *
 * 鉴权:
 *   - GET / PATCH:OPERATOR(运营 + 管理员)
 *   - DELETE:ADMIN(删除是不可逆操作,只给管理员)
 * 审计:PATCH 转 CANCELED / PENDING / 改 priority 各写一条 AuditLog
 *
 * 状态约束(重构后):
 *   - CANCELED:仅 PENDING / RUNNING / FAILED 可改成 CANCELED;SUCCEEDED 不动
 *   - PENDING(重新排队):仅 FAILED / CANCELED 可改成 PENDING;同时清掉 startedAt/finishedAt/exitCode/errorMessage
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { conflict, notFound } from "@/lib/errors";
import { taskUpdateSchema } from "@/lib/validation/crawler";
import { recordAudit } from "@/lib/audit";

/** 在 task 日志文件末尾追加一行 server 侧 marker(取消 / 重排队等)。
 * 文件不存在 / 写入失败都安静吞掉(管理员只是想看个提示,不要因为 IO 失败把 PATCH 也带挂)。 */
async function appendLogMarker(logPath: string | null, line: string): Promise<void> {
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

export const GET = route(async (_req, { params }) => {
  await requireRole("OPERATOR");
  const id = params?.id ?? "";

  const task = await prisma.crawlerTask.findUnique({
    where: { id },
    include: {
      job: {
        select: {
          id: true,
          name: true,
          repoType: true,
          repoUrl: true,
          repoBranch: true,
          workdir: true,
          command: true,
          timeoutMinutes: true,
          paramSchema: true,
          outputs: true,
        },
      },
      agent: { select: { id: true, name: true, status: true, lastSeenAt: true } },
      createdBy: { select: { username: true } },
      datasets: {
        select: {
          id: true,
          csvType: true,
          fileName: true,
          fileSize: true,
          rowCount: true,
          parsedAt: true,
          parseError: true,
          createdAt: true,
        },
      },
    },
  });
  if (!task) throw notFound("任务不存在");

  return Response.json(task);
});

export const PATCH = route(async (req, { params }) => {
  const session = await requireRole("OPERATOR");
  const id = params?.id ?? "";
  const input = await parseJson(req, taskUpdateSchema);

  const t = await prisma.crawlerTask.findUnique({
    where: { id },
    select: { id: true, status: true, logPath: true, priority: true },
  });
  if (!t) throw notFound("任务不存在");

  const data: Record<string, unknown> = {};
  let cancelMarker: string | null = null;
  let requeueMarker: string | null = null;
  const audits: Promise<void>[] = [];

  if (input.priority !== undefined && input.priority !== t.priority) {
    data.priority = input.priority;
    audits.push(
      recordAudit({
        actorId: session.sub,
        actorUsername: session.username,
        action: "task.priority",
        targetType: "task",
        targetId: t.id,
        details: { from: t.priority, to: input.priority },
      }),
    );
  }

  if (input.status === "CANCELED") {
    if (t.status === "SUCCEEDED") throw conflict("已完成任务不能取消");
    if (t.status === "CANCELED") {
      return Response.json({ ok: true });
    }
    data.status = "CANCELED";
    data.finishedAt = new Date();
    const wasRunning = t.status === "RUNNING";
    cancelMarker =
      `\n[server] ${new Date().toISOString()} 任务被 ${session.username} 取消` +
      (wasRunning ? ",Agent 将在数秒内 kill 子进程" : "") +
      "\n";
    audits.push(
      recordAudit({
        actorId: session.sub,
        actorUsername: session.username,
        action: "task.cancel",
        targetType: "task",
        targetId: t.id,
        details: { fromStatus: t.status },
      }),
    );
  }

  if (input.status === "PENDING") {
    if (t.status !== "FAILED" && t.status !== "CANCELED")
      throw conflict("只有失败 / 取消的任务可以重新排队");
    data.status = "PENDING";
    data.startedAt = null;
    data.finishedAt = null;
    data.exitCode = null;
    data.errorMessage = null;
    requeueMarker = `\n[server] ${new Date().toISOString()} 任务被 ${session.username} 重新排队\n`;
    audits.push(
      recordAudit({
        actorId: session.sub,
        actorUsername: session.username,
        action: "task.requeue",
        targetType: "task",
        targetId: t.id,
        details: { fromStatus: t.status },
      }),
    );
  }

  if (Object.keys(data).length === 0) return Response.json({ ok: true });

  await prisma.crawlerTask.update({ where: { id }, data });

  // 转 CANCELED / PENDING 时往原日志文件追加 marker,日志页能看到收尾
  if (cancelMarker) await appendLogMarker(t.logPath, cancelMarker);
  if (requeueMarker) await appendLogMarker(t.logPath, requeueMarker);

  await Promise.all(audits);

  return Response.json({ ok: true });
});

export const DELETE = route(async (_req, { params }) => {
  await requireRole("ADMIN");
  const id = params?.id ?? "";
  const t = await prisma.crawlerTask.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!t) throw notFound("任务不存在");
  if (t.status === "RUNNING")
    throw conflict("任务正在被 Agent 执行,先取消再删");

  await prisma.crawlerTask.delete({ where: { id } });
  return Response.json({ ok: true });
});
