/**
 * POST /api/agent/tasks/[id]/log — agent 流式上报子进程 stdout/stderr 片段。
 *
 * 鉴权:Bearer <agentId>.<secret>
 * Content-Type:text/plain;charset=utf-8(也接受空 body)
 * 行为:append 到 data/logs/<taskId>.log;首次会顺手把 logPath 写到 task。
 *
 * 校验:任务必须由当前 agent RUNNING(否则 409)。日志单次 body 上限 1 MB,超过会被截断。
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAgent } from "@/lib/agent-auth";
import { badRequest, conflict, notFound } from "@/lib/errors";

export const runtime = "nodejs";

const MAX_CHUNK_BYTES = 1 * 1024 * 1024; // 1 MB
const LOG_DIR_REL = "data/logs";

export const POST = route(async (req, { params }) => {
  const agent = await requireAgent(req);
  const taskId = params?.id ?? "";
  if (!taskId) throw badRequest("缺少任务 id");

  const task = await prisma.crawlerTask.findUnique({
    where: { id: taskId },
    select: { id: true, agentId: true, status: true, logPath: true },
  });
  if (!task) throw notFound("任务不存在");
  if (task.agentId !== agent.id) throw conflict("任务不属于当前 agent");
  if (task.status !== "RUNNING") throw conflict("任务当前状态不可上报日志");

  const buf = Buffer.from(await req.arrayBuffer());
  const chunk = buf.byteLength > MAX_CHUNK_BYTES ? buf.subarray(0, MAX_CHUNK_BYTES) : buf;

  const dir = path.join(process.cwd(), LOG_DIR_REL);
  await fs.mkdir(dir, { recursive: true });
  const relPath = path.posix.join(LOG_DIR_REL, `${task.id}.log`);
  const absPath = path.join(process.cwd(), relPath);
  await fs.appendFile(absPath, chunk);

  // 首次写日志时持久化 logPath(后续 ADMIN UI 看日志的入口)
  if (!task.logPath) {
    await prisma.crawlerTask.update({
      where: { id: task.id },
      data: { logPath: relPath },
    });
  }

  return Response.json({ ok: true, bytes: chunk.byteLength });
});
