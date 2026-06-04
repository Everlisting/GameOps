/**
 * GET  /api/admin/jobs — 列出 Job 模板(管理员)
 * POST /api/admin/jobs — 新建 Job 模板
 *
 * 鉴权:ADMIN
 *
 * Job 是任务的"模板"(参考 Jenkins Job),绑定一台爬虫机,声明:
 *   仓库地址 / 工作目录 / 命令模板(含 {{var}}) / 参数 schema / 产物清单 / 单次超时 / 可选 cron。
 * 每次执行落地为一条 CrawlerTask(/jobs/[id]/trigger 或 cron 自动建)。
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { createJobSchema, jobListQuerySchema } from "@/lib/validation/job";
import type { Prisma } from "@prisma/client";

export const GET = route(async (req) => {
  await requireRole("ADMIN");
  const url = new URL(req.url);
  const { agentId, enabled, q } = jobListQuerySchema.parse(
    Object.fromEntries(url.searchParams),
  );

  const items = await prisma.crawlerJob.findMany({
    where: {
      ...(agentId ? { agentId } : {}),
      ...(enabled ? { enabled: enabled === "true" } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      enabled: true,
      repoType: true,
      repoUrl: true,
      repoBranch: true,
      cronExpression: true,
      timeoutMinutes: true,
      createdAt: true,
      updatedAt: true,
      agent: { select: { id: true, name: true, status: true, lastSeenAt: true } },
      createdBy: { select: { username: true } },
      _count: { select: { tasks: true } },
    },
  });

  return Response.json({ items });
});

export const POST = route(async (req) => {
  const session = await requireRole("ADMIN");
  const input = await parseJson(req, createJobSchema);

  const [nameDup, agent] = await Promise.all([
    prisma.crawlerJob.findUnique({ where: { name: input.name }, select: { id: true } }),
    prisma.crawlerAgent.findUnique({
      where: { id: input.agentId },
      select: { id: true, status: true },
    }),
  ]);
  if (nameDup) throw conflict("Job 名称已存在");
  if (!agent) throw notFound("绑定的爬虫机不存在");
  if (agent.status !== "ACTIVE")
    throw badRequest("绑定的爬虫机已停用,请先启用或换一台");

  const job = await prisma.crawlerJob.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      agentId: input.agentId,
      repoType: input.repoType,
      repoUrl: input.repoUrl,
      repoBranch: input.repoBranch ?? null,
      workdir: input.workdir,
      command: input.command,
      timeoutMinutes: input.timeoutMinutes,
      paramSchema: input.paramSchema as unknown as Prisma.InputJsonValue,
      outputs: input.outputs as unknown as Prisma.InputJsonValue,
      cronExpression: input.cronExpression ?? null,
      enabled: input.enabled,
      createdById: session.sub,
    },
    select: { id: true, name: true, createdAt: true },
  });

  // 通知 cron scheduler 增量同步(在 Task 5 实现;此处先 import & call,模块不存在时静默跳过)
  await notifyJobChanged(job.id).catch(() => {});

  return Response.json(job, { status: 201 });
});

async function notifyJobChanged(jobId: string): Promise<void> {
  // 动态 import 避免 Edge runtime 误打包 node-cron
  try {
    const mod = await import("@/lib/cron-scheduler");
    await mod.syncJob(jobId);
  } catch {
    // scheduler 尚未启用 / 测试环境 等,忽略
  }
}
