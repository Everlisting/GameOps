/**
 * PATCH  /api/admin/agents/[id] — 改 name / status
 * DELETE /api/admin/agents/[id] — 物理删除(仅当没在跑任务、且没有绑定的 Job 时)
 *
 * 鉴权:ADMIN
 *
 * 重构后:删 capabilities 字段;有绑定 Job 时拒绝删(否则 Job.agentId 会断指)。
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { conflict, notFound } from "@/lib/errors";
import { agentUpdateSchema } from "@/lib/validation/crawler";

export const PATCH = route(async (req, { params }) => {
  await requireRole("ADMIN");
  const id = params?.id ?? "";
  const input = await parseJson(req, agentUpdateSchema);

  const existing = await prisma.crawlerAgent.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!existing) throw notFound("Agent 不存在");

  // 改名时查重(排除自身)
  if (input.name && input.name !== existing.name) {
    const dup = await prisma.crawlerAgent.findUnique({
      where: { name: input.name },
      select: { id: true },
    });
    if (dup && dup.id !== id) throw conflict("机器名已存在");
  }

  const data: Record<string, unknown> = {};
  for (const k of ["name", "status"] as const) {
    if (input[k] !== undefined) data[k] = input[k];
  }

  await prisma.crawlerAgent.update({ where: { id }, data });
  return Response.json({ ok: true });
});

export const DELETE = route(async (_req, { params }) => {
  await requireRole("ADMIN");
  const id = params?.id ?? "";
  const existing = await prisma.crawlerAgent.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw notFound("Agent 不存在");

  // 有绑定 Job 不让删,先迁移
  const boundJobs = await prisma.crawlerJob.count({ where: { agentId: id } });
  if (boundJobs > 0)
    throw conflict(`该 Agent 还绑定着 ${boundJobs} 个 Job,请先迁移或删 Job`);

  // 有正在跑的任务不让删
  const running = await prisma.crawlerTask.count({
    where: { agentId: id, status: "RUNNING" },
  });
  if (running > 0) throw conflict("该 Agent 还有正在跑的任务,先取消");

  // 删 Agent 不会级联删任务历史,FK 是 SetNull
  await prisma.crawlerAgent.delete({ where: { id } });
  return Response.json({ ok: true });
});
