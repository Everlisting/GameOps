/**
 * GET  /api/admin/agents — 列出 agents(管理员)
 * POST /api/admin/agents — 新建 agent + 立刻返回 token(仅此一次)
 *
 * 鉴权:ADMIN
 *
 * token 只在创建/重置时回显,以后服务端只能看到 argon2 哈希,无法回放原文。
 * 重构后(2026-06)删 capabilities 字段:任务由 Job 显式绑定到 Agent,不再走 csvType 抢占。
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { conflict } from "@/lib/errors";
import {
  agentCreateSchema,
  agentListQuerySchema,
} from "@/lib/validation/crawler";
import { buildAgentToken, generateAgentSecret } from "@/lib/agent-token";

export const GET = route(async (req) => {
  await requireRole("ADMIN");
  const url = new URL(req.url);
  const { status, q } = agentListQuerySchema.parse(
    Object.fromEntries(url.searchParams),
  );

  const items = await prisma.crawlerAgent.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      lastSeenAt: true,
      lastSeenIp: true,
      createdAt: true,
      _count: { select: { tasks: true, jobs: true } },
      createdBy: { select: { username: true } },
    },
  });

  return Response.json({ items });
});

export const POST = route(async (req) => {
  const session = await requireRole("ADMIN");
  const input = await parseJson(req, agentCreateSchema);

  const existing = await prisma.crawlerAgent.findUnique({
    where: { name: input.name },
    select: { id: true },
  });
  if (existing) throw conflict("机器名已存在");

  const secret = generateAgentSecret();
  const tokenHash = await hashPassword(secret);

  const agent = await prisma.crawlerAgent.create({
    data: {
      name: input.name,
      tokenHash,
      createdById: session.sub,
    },
    select: { id: true, name: true, createdAt: true },
  });

  return Response.json(
    {
      ...agent,
      // ⚠️ token 仅此一次返回,前端必须立刻提示保存
      token: buildAgentToken(agent.id, secret),
    },
    { status: 201 },
  );
});
