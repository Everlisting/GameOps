/**
 * 阶段10.2 · AI 助手 · 用量统计(ADMIN 成本面板)。
 *
 * 数据源:AiRun(token / 请求)+ AiConversation.userId 归属到运营用户。
 * 分桶按 Asia/Shanghai 自然日;区间内缺失日补 0。token 用 ::float8 输出,避免 bigint 破坏 JSON 序列化。
 * 可选 userId 过滤:卡片 + 曲线按该用户收窄;各用户明细表始终为全量(便于对比)。
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export interface UsageDaily {
  date: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UsagePerUser {
  userId: string;
  username: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface UsageUserOption {
  id: string;
  username: string;
}

export interface UsageStats {
  range: { from: string; to: string };
  selectedUserId: string | null;
  userOptions: UsageUserOption[];
  overall: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    users: number;
  };
  daily: UsageDaily[];
  perUser: UsagePerUser[];
}

/** 枚举 [from, to] 内每个自然日(YYYY-MM-DD,仅作标签,不涉时区)。 */
function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** from/to = 上海时区自然日(YYYY-MM-DD,含端点);userId 为空 = 全局。 */
export async function getUsageStats(
  from: string,
  to: string,
  userId?: string,
): Promise<UsageStats> {
  const fromTs = new Date(`${from}T00:00:00+08:00`);
  const toTs = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 24 * 3600 * 1000);
  const userCond = userId ? Prisma.sql`AND c."userId" = ${userId}` : Prisma.empty;

  // 曲线 + 卡片:按 userId 收窄(userId 为空则全量)
  const rawDaily = await prisma.$queryRaw<UsageDaily[]>(Prisma.sql`
    SELECT to_char((r."createdAt" AT TIME ZONE 'Asia/Shanghai')::date, 'YYYY-MM-DD') AS date,
           COUNT(*)::int                          AS requests,
           COALESCE(SUM(r."inputTokens"), 0)::float8  AS "inputTokens",
           COALESCE(SUM(r."outputTokens"), 0)::float8 AS "outputTokens"
    FROM "ai_run" r
    JOIN "ai_conversation" c ON c.id = r."conversationId"
    WHERE r."createdAt" >= ${fromTs} AND r."createdAt" < ${toTs} ${userCond}
    GROUP BY 1
    ORDER BY 1`);

  // 各用户明细表:始终全量(便于横向对比),不受 userId 影响
  const perUserRaw = await prisma.$queryRaw<Omit<UsagePerUser, "totalTokens">[]>(Prisma.sql`
    SELECT u.id AS "userId", u.username,
           COUNT(*)::int                          AS requests,
           COALESCE(SUM(r."inputTokens"), 0)::float8  AS "inputTokens",
           COALESCE(SUM(r."outputTokens"), 0)::float8 AS "outputTokens"
    FROM "ai_run" r
    JOIN "ai_conversation" c ON c.id = r."conversationId"
    JOIN "User" u ON u.id = c."userId"
    WHERE r."createdAt" >= ${fromTs} AND r."createdAt" < ${toTs}
    GROUP BY u.id, u.username
    ORDER BY (COALESCE(SUM(r."inputTokens"), 0) + COALESCE(SUM(r."outputTokens"), 0)) DESC`);

  // 下拉选项:所有用过助手的用户(与日期区间无关,选择更稳定)
  const userOptions = await prisma.$queryRaw<UsageUserOption[]>(Prisma.sql`
    SELECT DISTINCT u.id, u.username
    FROM "ai_conversation" c
    JOIN "User" u ON u.id = c."userId"
    ORDER BY u.username`);

  const map = new Map(rawDaily.map((d) => [d.date, d]));
  const daily = eachDay(from, to).map(
    (date) => map.get(date) ?? { date, requests: 0, inputTokens: 0, outputTokens: 0 },
  );

  const overall = daily.reduce(
    (a, d) => {
      a.requests += d.requests;
      a.inputTokens += d.inputTokens;
      a.outputTokens += d.outputTokens;
      return a;
    },
    { requests: 0, inputTokens: 0, outputTokens: 0 },
  );

  return {
    range: { from, to },
    selectedUserId: userId ?? null,
    userOptions,
    overall: {
      ...overall,
      totalTokens: overall.inputTokens + overall.outputTokens,
      users: perUserRaw.length,
    },
    daily,
    perUser: perUserRaw.map((u) => ({ ...u, totalTokens: u.inputTokens + u.outputTokens })),
  };
}
