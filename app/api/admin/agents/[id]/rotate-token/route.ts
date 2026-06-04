/**
 * POST /api/admin/agents/[id]/rotate-token — 重置 agent token
 *
 * 鉴权:ADMIN
 * 返回:新 token(仅此一次)。
 * 旧 token 立即失效;若旧 token 正在跑任务,任务本身不受影响(claim 早就发生过),
 * 但下次该 agent 任何鉴权请求都会用新 token。
 */
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { notFound } from "@/lib/errors";
import { buildAgentToken, generateAgentSecret } from "@/lib/agent-token";

export const POST = route(async (_req, { params }) => {
  await requireRole("ADMIN");
  const id = params?.id ?? "";

  const existing = await prisma.crawlerAgent.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!existing) throw notFound("Agent 不存在");

  const secret = generateAgentSecret();
  const tokenHash = await hashPassword(secret);
  await prisma.crawlerAgent.update({
    where: { id },
    data: { tokenHash },
  });

  return Response.json({
    id: existing.id,
    name: existing.name,
    token: buildAgentToken(existing.id, secret),
  });
});
