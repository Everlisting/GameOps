/**
 * POST /api/agent/heartbeat — agent 心跳
 *
 * 鉴权:Bearer <agentId>.<secret>
 * Body:{ agentStatus?: "idle" | "busy", version?: string }
 * Resp:{ now: ISO, pending: number, suggestPollMs: number }
 *
 * 重构后:pending 只统计绑定到当前 agent 的 PENDING 任务(并发 = 1,所以同一时刻至多 1 个 RUNNING)。
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAgent } from "@/lib/agent-auth";
import { heartbeatRequestSchema } from "@/lib/validation/crawler";
import type { Prisma } from "@prisma/client";

export const POST = route(async (req) => {
  const agent = await requireAgent(req);
  const input = await parseJson(req, heartbeatRequestSchema);

  await prisma.crawlerAgent.update({
    where: { id: agent.id },
    data: {
      lastHeartbeatAt: new Date(),
      ...(input.agentStatus ? { executorStatus: input.agentStatus } : {}),
      ...(input.version ? { agentVersion: input.version } : {}),
      ...(input.hostname ? { hostname: input.hostname } : {}),
      ...(input.pythonVersion ? { pythonVersion: input.pythonVersion } : {}),
      ...(input.gitVersion ? { gitVersion: input.gitVersion } : {}),
      ...(input.diagnostics
        ? { diagnostics: input.diagnostics as Prisma.InputJsonValue }
        : {}),
    },
  });

  const pending = await prisma.crawlerTask.count({
    where: {
      status: "PENDING",
      agentId: agent.id,
    },
  });

  return Response.json({
    now: new Date().toISOString(),
    pending,
    // 简单退避:本机队列有活时 5s 拉一次,无活时 30s
    suggestPollMs: pending > 0 ? 5_000 : 30_000,
  });
});
