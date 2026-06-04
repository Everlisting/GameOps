/**
 * 爬虫 Agent 鉴权:
 *   Authorization: Bearer <agentId>.<secret>
 *
 * - agentId 是 CrawlerAgent.id(cuid),便于在不扫全表的情况下定位记录
 * - secret 段在 DB 里以 argon2 哈希形式存储(同密码),传输只走 https
 * - 鉴权命中后异步更新 lastSeenAt / lastSeenIp,失败不阻塞主流程
 *
 * 重构后(2026-06):删除 capabilities 字段,任务由 Job 绑定到 Agent,/claim 只看 agentId。
 * Token 生成 / 重置由管理员端 API 触发,见 lib/agent-token.ts。
 */
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { forbidden, unauthorized } from "@/lib/errors";

export type AuthenticatedAgent = {
  id: string;
  name: string;
};

/** 从 Authorization 头解析 agent token,校验通过则返回 agent;失败抛 401/403。 */
export async function requireAgent(req: Request): Promise<AuthenticatedAgent> {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!m) throw unauthorized("缺少 Bearer Token");

  const token = m[1].trim();
  const dot = token.indexOf(".");
  if (dot < 1) throw unauthorized("Token 格式错误");
  const agentId = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!secret) throw unauthorized("Token 格式错误");

  const agent = await prisma.crawlerAgent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      name: true,
      status: true,
      tokenHash: true,
    },
  });
  if (!agent) throw unauthorized("Token 无效");

  const ok = await verifyPassword(agent.tokenHash, secret);
  if (!ok) throw unauthorized("Token 无效");

  if (agent.status === "DISABLED") throw forbidden("机器已被停用");

  // 心跳:异步更新,不阻塞响应;失败不影响调用方
  const ip = pickClientIp(req);
  void prisma.crawlerAgent
    .update({
      where: { id: agent.id },
      data: { lastSeenAt: new Date(), lastSeenIp: ip },
    })
    .catch(() => {
      /* ignore */
    });

  return {
    id: agent.id,
    name: agent.name,
  };
}

function pickClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}
