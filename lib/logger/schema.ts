/**
 * 运行日志的字段契约与常量(纯类型/常量,Edge 与 Node 共用,不引 Node 内建)。
 * 详见 docs/logging.md §3(schema)/§6.5(大小限制)。
 */

export const SCHEMA_VERSION = 1 as const;

/** 级别从低到高;数字越大越严重,用于阈值过滤。 */
export const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
export type LogLevel = (typeof LEVELS)[number];
export const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

/** §6.5 大小上限(字节 / 项数 / 深度)。超限截断并标记 truncated。 */
export const LIMITS = {
  record: 32 * 1024, // 单条日志序列化后
  string: 2 * 1024, // 普通字符串
  errMessage: 4 * 1024,
  errStack: 16 * 1024,
  arrayItems: 20,
  depth: 6,
} as const;

/**
 * 归一化错误结构(已脱敏 + 已限长)。
 * 详见 docs/logging.md §3 err 字段。
 */
export interface NormalizedError {
  name?: string;
  message?: string;
  code?: string;
  stack?: string;
  truncated?: boolean;
}

/**
 * 链路上下文:由 route()/worker 写入 ALS,logger 每条自动并入。
 * 不含明文标识符——userId/chatId 只以 HMAC 形式落 userIdHash/chatIdHash。
 */
export interface LogContext {
  requestId?: string;
  traceId?: string;
  userIdHash?: string;
  chatIdHash?: string;
  role?: string;
  method?: string;
  route?: string;
}

/**
 * 调用点可直接放到顶层的已知字段(其余键收进 fields 桶再脱敏)。
 * err 单独归一化处理,不在此列。
 */
export const KNOWN_TOP_LEVEL = [
  "event",
  "requestId",
  "traceId",
  "taskId",
  "jobId",
  "agentId",
  "opinionTaskId",
  "runId",
  "conversationId",
  "documentId",
  "worker",
  "userIdHash",
  "chatIdHash",
  "role",
  "method",
  "route",
  "status",
  "durationMs",
  "operation",
  "model",
  "queryFingerprint",
  "service",
  // sink 内部日志标记:禁止再进 DB/告警 sink(§9.2 防递归)
  "sinkInternal",
] as const;
export type KnownTopLevelKey = (typeof KNOWN_TOP_LEVEL)[number];
const KNOWN_TOP_LEVEL_SET = new Set<string>(KNOWN_TOP_LEVEL);
export function isKnownTopLevel(key: string): boolean {
  return KNOWN_TOP_LEVEL_SET.has(key);
}

/**
 * 调用点传入的字段对象(logger.info(msg, fields))。
 * event 强烈建议提供;err 会被归一化;persist 供可选 ErrorLog sink 判定(本阶段仅透传)。
 */
export interface LogFields {
  event?: string;
  err?: unknown;
  /** 仅 error/fatal 有意义;标记该条应持久化到 ErrorLog(可选 sink 才生效,客户端不可传)。 */
  persist?: boolean;
  [key: string]: unknown;
}

/** 最终落盘的一条日志。pino/edge 都按此形状输出。 */
export interface LogRecord {
  schemaVersion: typeof SCHEMA_VERSION;
  ts: string; // UTC ISO 8601
  level: LogLevel;
  service: string;
  environment: string;
  release?: string;
  instanceId?: string;
  module: string;
  event?: string;
  msg: string;
  err?: NormalizedError;
  fields?: Record<string, unknown>;
  truncated?: boolean;
  [key: string]: unknown; // 已知业务 ID / 上下文字段动态并入
}
