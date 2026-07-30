/**
 * POST /api/agent/tasks/claim — agent 领取下一条 PENDING 任务。
 *
 * 鉴权:Bearer <agentId>.<secret>
 * Body:{}(空)
 * Resp:{ task: TaskBundle | null }
 *
 * 重构后语义:
 *   - 任务直接绑定到 Agent(Job.agentId),不再走 csvType 抢占
 *   - 单语句 UPDATE … SELECT FOR UPDATE SKIP LOCKED 原子转 PENDING → RUNNING
 *   - 并发 = 1:若该 agent 已有 RUNNING 任务,本次直接返回 null(在 SQL 内用 NOT EXISTS 保证)
 *   - 响应回带 Job 完整执行信息(仓库 / 工作目录 / 命令 / 超时 / 产物清单 / 参数值)
 */
import { Prisma } from "@prisma/client";

import { route, parseJson } from "@/lib/api";
import { supportsReproducibleExecution } from "@/lib/crawler/agent-version";
import { prisma } from "@/lib/db";
import { conflict } from "@/lib/errors";
import { requireAgent } from "@/lib/agent-auth";
import { claimRequestSchema } from "@/lib/validation/crawler";

export const POST = route(async (req) => {
  const agent = await requireAgent(req);
  await parseJson(req, claimRequestSchema);
  if (!supportsReproducibleExecution(agent.agentVersion)) {
    throw conflict(
      `P3 可复现执行要求 Agent 0.5.0+,当前版本 ${agent.agentVersion ?? "未上报"}`,
    );
  }

  // 原子领取:同 agent 已经有 RUNNING 时跳过(并发 = 1)
  // 时间戳显式转 UTC,避免 PG 会话时区影响(timestamp 列对 NOW() 的解释依赖 session TZ)
  const claimed = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    UPDATE "CrawlerTask"
    SET status = 'RUNNING'::"CrawlerTaskStatus",
        "startedAt" = (NOW() AT TIME ZONE 'UTC'),
        "updatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE id = (
      SELECT id FROM "CrawlerTask"
      WHERE status = 'PENDING'::"CrawlerTaskStatus"
        AND "agentId" = ${agent.id}
        AND NOT EXISTS (
          SELECT 1 FROM "CrawlerTask" t2
          WHERE t2."agentId" = ${agent.id}
            AND t2.status = 'RUNNING'::"CrawlerTaskStatus"
        )
      ORDER BY priority DESC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `);

  if (claimed.length === 0) {
    return Response.json({ task: null });
  }

  // 新任务优先返回创建时冻结的 jobSnapshot。历史任务没有快照时才回退到当前 Job。
  const task = await prisma.crawlerTask.findUnique({
    where: { id: claimed[0].id },
    select: {
      id: true,
      sequenceNumber: true,
      paramValues: true,
      priority: true,
      createdAt: true,
      jobRevision: true,
      sourceRevision: true,
      jobSnapshot: true,
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
          outputs: true,
        },
      },
    },
  });

  if (!task) {
    return Response.json({ task: null });
  }

  const { jobSnapshot, job, ...taskFields } = task;
  return Response.json({
    task: {
      ...taskFields,
      job: jobSnapshot ?? job,
    },
  });
});
