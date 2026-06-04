/**
 * GET /api/admin/tasks — 列出任务(管理员)
 *
 * 鉴权:ADMIN
 *
 * 重构后:直接建任务的入口已废,任务只能通过 /api/admin/jobs/[id]/trigger 创建。
 * 此处仅保留列表能力,detail 走 GET /api/admin/tasks/[id]。
 */
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { taskListQuerySchema } from "@/lib/validation/crawler";

export const GET = route(async (req) => {
  await requireRole("ADMIN");
  const url = new URL(req.url);
  const { status, trigger, jobId, agentId } = taskListQuerySchema.parse(
    Object.fromEntries(url.searchParams),
  );

  const items = await prisma.crawlerTask.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(trigger ? { trigger } : {}),
      ...(jobId ? { jobId } : {}),
      ...(agentId ? { agentId } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      jobId: true,
      sequenceNumber: true,
      paramValues: true,
      trigger: true,
      priority: true,
      status: true,
      exitCode: true,
      errorMessage: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      job: { select: { id: true, name: true } },
      agent: { select: { id: true, name: true } },
      createdBy: { select: { username: true } },
      datasets: { select: { id: true, csvType: true, rowCount: true, fileSize: true } },
    },
  });

  return Response.json({ items });
});
