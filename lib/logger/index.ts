/**
 * 运行日志入口(Node runtime)。pino 仅作 stdout 单行 JSON 写出;
 * schema/脱敏/业务 ID/上下文全由本项目掌控(见 docs/logging.md §2.1/§3)。
 * Edge(middleware)用 lib/logger/edge.ts,不要从这里 import。
 */
import { hostname } from "node:os";

import pino from "pino";

import { assembleFields, capRecordSize } from "@/lib/logger/assemble";
import { bootstrapLog } from "@/lib/logger/bootstrap";
import { getLogContext } from "@/lib/logger/context";
import { clampString, scrubString } from "@/lib/logger/redact";
import {
  LEVELS,
  LEVEL_ORDER,
  LIMITS,
  SCHEMA_VERSION,
  type LogFields,
  type LogLevel,
} from "@/lib/logger/schema";

// ── 配置(启动读一次 process.env;缺失走安全默认)──────────────────────
function parseLevel(v: string | undefined, fallback: LogLevel): LogLevel {
  return (LEVELS as readonly string[]).includes(v ?? "") ? (v as LogLevel) : fallback;
}

const GLOBAL_LEVEL = parseLevel(process.env.LOG_LEVEL, "info");

const LEVEL_OVERRIDES: Record<string, LogLevel> = (() => {
  const raw = process.env.LOG_LEVEL_OVERRIDES;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, LogLevel> = {};
    for (const [mod, lvl] of Object.entries(parsed)) {
      if ((LEVELS as readonly string[]).includes(lvl)) out[mod] = lvl as LogLevel;
    }
    return out;
  } catch {
    bootstrapLog("warn", "LOG_LEVEL_OVERRIDES 非法 JSON,已忽略");
    return {};
  }
})();

const SERVICE = process.env.LOG_SERVICE || "gameops-web";
const ENVIRONMENT = process.env.NODE_ENV || "development";
const RELEASE = process.env.LOG_RELEASE || undefined;
const INSTANCE_ID = `${safeHostname()}/${process.pid}`;

function safeHostname(): string {
  try {
    return hostname();
  } catch {
    return "unknown";
  }
}

const pinoLogger = pino({
  level: "trace", // 自行按 module 过滤,pino 不再二次拦
  base: {
    schemaVersion: SCHEMA_VERSION,
    service: SERVICE,
    environment: ENVIRONMENT,
    ...(RELEASE ? { release: RELEASE } : {}),
    instanceId: INSTANCE_ID,
  },
  messageKey: "msg",
  // err 已由本项目归一化;identity serializer 阻止 pino 再套一层 stdSerializers.err
  serializers: { err: (e: unknown) => e },
  timestamp: () => `,"ts":"${new Date().toISOString()}"`,
  formatters: { level: (label) => ({ level: label }) },
});

function effectiveLevel(module: string): LogLevel {
  return LEVEL_OVERRIDES[module] ?? GLOBAL_LEVEL;
}

// ErrorLog sink(可选):动态 import 打破与 lib/db 的循环(index→sink→error-log-db→db→index);
// 禁用时 enqueueError 恒为 null(零开销)。启动首刻 import 未就绪前的错误会漏持久化,可接受。
type PersistFn = (input: import("@/lib/logger/sinks/error-db").PersistInput) => void;
let enqueueError: PersistFn | null = null;
void import("@/lib/logger/sinks/error-db")
  .then((m) => {
    if (m.isErrorDbEnabled()) enqueueError = m.enqueueErrorLog;
  })
  .catch((err) => bootstrapLog("warn", "ErrorLog sink 加载失败", { err: err instanceof Error ? err.message : String(err) }));

const asStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

function emit(module: string, level: LogLevel, msg: string, fields?: LogFields): void {
  try {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[effectiveLevel(module)]) return;
    const emitFields = assembleFields(module, fields, getLogContext());
    const cleanMsg = clampString(scrubString(msg ?? ""), LIMITS.string).value;
    capRecordSize(emitFields, cleanMsg);
    pinoLogger[level](emitFields, cleanMsg);

    // 高价值错误持久化:fatal 恒持久化,error 需显式 persist;sinkInternal 记录不入库(防递归)
    if (
      enqueueError &&
      emitFields.sinkInternal !== true &&
      (level === "fatal" || (level === "error" && fields?.persist === true))
    ) {
      enqueueError({
        occurredAt: new Date().toISOString(),
        level,
        service: SERVICE,
        environment: ENVIRONMENT,
        release: RELEASE,
        instanceId: INSTANCE_ID,
        module,
        event: asStr(emitFields.event),
        msg: cleanMsg,
        requestId: asStr(emitFields.requestId),
        traceId: asStr(emitFields.traceId),
        taskId: asStr(emitFields.taskId),
        runId: asStr(emitFields.runId),
        userIdHash: asStr(emitFields.userIdHash),
        err: emitFields.err as { name?: string; message?: string; code?: string; stack?: string } | undefined,
        fields: emitFields.fields as Record<string, unknown> | undefined,
      });
    }
  } catch (err) {
    bootstrapLog("error", "logger emit 失败", { module, err: err instanceof Error ? err.message : String(err) });
  }
}

export interface Logger {
  trace(msg: string, fields?: LogFields): void;
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  fatal(msg: string, fields?: LogFields): void;
}

/** 建一个绑定 module 的 logger;module 命名用点分层(如 "agent.task")。 */
export function createLogger(module: string): Logger {
  return {
    trace: (m, f) => emit(module, "trace", m, f),
    debug: (m, f) => emit(module, "debug", m, f),
    info: (m, f) => emit(module, "info", m, f),
    warn: (m, f) => emit(module, "warn", m, f),
    error: (m, f) => emit(module, "error", m, f),
    fatal: (m, f) => emit(module, "fatal", m, f),
  };
}

export { runWithLogContext, getLogContext, updateLogContext } from "@/lib/logger/context";
export { hashIdentifier } from "@/lib/logger/hash";
export type { LogFields, LogContext } from "@/lib/logger/schema";
