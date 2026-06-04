/**
 * GET    /api/admin/jobs/[id] — Job 详情(含 paramSchema / outputs 完整内容)
 * PATCH  /api/admin/jobs/[id] — 改 Job 任意字段(部分更新)
 * DELETE /api/admin/jobs/[id] — 删除 Job(有 RUNNING/PENDING 任务时拒绝)
 *
 * 鉴权:ADMIN
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { updateJobSchema } from "@/lib/validation/job";
import type { Prisma } from "@prisma/client";

export const GET = route(async (_req, { params }) => {
  await requireRole("ADMIN");
  const id = params?.id ?? "";

  const job = await prisma.crawlerJob.findUnique({
    where: { id },
    include: {
      agent: { select: { id: true, name: true, status: true, lastSeenAt: true } },
      createdBy: { select: { username: true } },
      _count: { select: { tasks: true } },
    },
  });
  if (!job) throw notFound("Job 不存在");

  return Response.json(job);
});

export const PATCH = route(async (req, { params }) => {
  await requireRole("ADMIN");
  const id = params?.id ?? "";
  const input = await parseJson(req, updateJobSchema);

  const existing = await prisma.crawlerJob.findUnique({
    where: { id },
    select: { id: true, name: true, agentId: true, command: true, paramSchema: true, outputs: true },
  });
  if (!existing) throw notFound("Job 不存在");

  // 改名查重(排除自身)
  if (input.name && input.name !== existing.name) {
    const dup = await prisma.crawlerJob.findUnique({
      where: { name: input.name },
      select: { id: true },
    });
    if (dup && dup.id !== id) throw conflict("Job 名称已存在");
  }

  // 改 agentId 时校验目标 agent 存在 + ACTIVE
  if (input.agentId && input.agentId !== existing.agentId) {
    const agent = await prisma.crawlerAgent.findUnique({
      where: { id: input.agentId },
      select: { id: true, status: true },
    });
    if (!agent) throw notFound("绑定的爬虫机不存在");
    if (agent.status !== "ACTIVE")
      throw badRequest("绑定的爬虫机已停用");
  }

  // 把 input 拍平到 update data;undefined 的字段不动
  const data: Record<string, unknown> = {};
  for (const k of [
    "name",
    "description",
    "agentId",
    "repoType",
    "repoUrl",
    "repoBranch",
    "workdir",
    "command",
    "timeoutMinutes",
    "enabled",
  ] as const) {
    if (input[k] !== undefined) data[k] = input[k];
  }
  if (input.paramSchema !== undefined) data.paramSchema = input.paramSchema as unknown as Prisma.InputJsonValue;
  if (input.outputs !== undefined) data.outputs = input.outputs as unknown as Prisma.InputJsonValue;
  // cronExpression 显式可空,null = 清掉定时
  if ("cronExpression" in input) data.cronExpression = input.cronExpression ?? null;

  // 改 agentId 时,把已经 PENDING 的任务也跟着搬到新 agent(否则会卡在旧机器队列里)
  await prisma.$transaction(async (tx) => {
    await tx.crawlerJob.update({ where: { id }, data });
    if (input.agentId && input.agentId !== existing.agentId) {
      await tx.crawlerTask.updateMany({
        where: { jobId: id, status: "PENDING" },
        data: { agentId: input.agentId },
      });
    }
  });

  // 通知 cron scheduler 增量同步
  try {
    const mod = await import("@/lib/cron-scheduler");
    await mod.syncJob(id);
  } catch {
    // ignore
  }

  return Response.json({ ok: true });
});

export const DELETE = route(async (_req, { params }) => {
  await requireRole("ADMIN");
  const id = params?.id ?? "";

  const existing = await prisma.crawlerJob.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw notFound("Job 不存在");

  // 有未完成任务时拒绝(避免任务孤儿:删了 Job,task.jobId 会被 SetNull,丢失上下文)
  const active = await prisma.crawlerTask.count({
    where: { jobId: id, status: { in: ["PENDING", "RUNNING"] } },
  });
  if (active > 0)
    throw conflict(`该 Job 还有 ${active} 个未完成任务,请先取消`);

  await prisma.crawlerJob.delete({ where: { id } });

  // 通知 cron scheduler 移除
  try {
    const mod = await import("@/lib/cron-scheduler");
    await mod.removeJob(id);
  } catch {
    // ignore
  }

  return Response.json({ ok: true });
});
