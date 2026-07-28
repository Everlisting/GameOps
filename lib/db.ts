/**
 * Prisma client 单例。避免 Next.js 开发热重载产生多连接。
 * 全项目只从这里导入 prisma。
 *
 * 日志:query/warn/error 走 event 模式交给 lib/logger(见 docs/logging.md §8)——
 * 普通 query 默认不落(消除 prisma:query 刷屏),仅慢查询记 warn,永不记 params。
 * ALS 上下文由 logger emit 时 getLogContext() 自动并入;Prisma 事件若不在请求 ALS 内则自然省略,不伪造关联。
 */
import { createHash } from "node:crypto";

import { PrismaClient, Prisma } from "@prisma/client";
import { env } from "@/lib/validation/env";
import { createLogger } from "@/lib/logger";

const dbLog = createLogger("db");
const SLOW_QUERY_MS = clampNum(process.env.LOG_SLOW_QUERY_MS, 500, 0, Infinity);
const QUERY_SAMPLE_RATE = clampNum(process.env.LOG_QUERY_SAMPLE_RATE, 0, 0, 1);

function clampNum(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

/** 从 SQL 提取操作与主表(best-effort,仅用于聚合标签)。 */
function parseSql(sql: string): { operation?: string; model?: string } {
  const op = sql.match(/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|BEGIN|COMMIT|ROLLBACK)/i)?.[1]?.toUpperCase();
  const model = sql.match(/(?:FROM|INTO|UPDATE|JOIN)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/i)?.[1];
  return { operation: op, model };
}

/** 规范化 SQL 模板($1 占位符,无 param 值)后取 sha256 前 16 位作指纹。 */
function fingerprintSql(sql: string): string {
  return createHash("sha256").update(sql.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16);
}

/** 记一条慢查询 / 采样 query;普通 query 默认不落(消除刷屏)。 */
function logQuery(e: Prisma.QueryEvent): void {
  const durationMs = e.duration;
  const slow = durationMs >= SLOW_QUERY_MS;
  if (!slow && !(QUERY_SAMPLE_RATE > 0 && Math.random() < QUERY_SAMPLE_RATE)) return;
  const { operation, model } = parseSql(e.query);
  const fields = {
    durationMs,
    operation,
    model,
    queryFingerprint: fingerprintSql(e.query),
    // e.query 是占位符模板(不含 param 值);仍收进 fields 桶限长,params 永不记
    query: e.query.replace(/\s+/g, " ").trim().slice(0, 300),
  };
  if (slow) dbLog.warn("慢查询", { event: "db.query.slow", ...fields });
  else dbLog.debug("查询", { event: "db.query", ...fields });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createClient() {
  const client = new PrismaClient({
    log: [
      { level: "error", emit: "event" },
      { level: "warn", emit: "event" },
      { level: "query", emit: "event" },
    ],
  });
  client.$on("error", (e) => dbLog.error("数据库错误", { event: "db.error", target: e.target, detail: e.message }));
  client.$on("warn", (e) => dbLog.warn("数据库告警", { event: "db.warn", target: e.target, detail: e.message }));
  client.$on("query", logQuery);
  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
