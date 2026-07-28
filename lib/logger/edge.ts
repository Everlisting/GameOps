/**
 * Edge-safe logger(middleware 用)。手写单行 JSON,console.log 写 stdout。
 * 不引 pino / node:async_hooks / node:crypto —— Edge runtime 只有 Web 标准 API。
 * Edge 无 ALS,上下文(requestId 等)在建 logger 时显式传入。见 docs/logging.md §4.2。
 */
import { assembleFields, capRecordSize } from "@/lib/logger/assemble";
import { clampString, scrubString } from "@/lib/logger/redact";
import {
  LEVELS,
  LEVEL_ORDER,
  LIMITS,
  SCHEMA_VERSION,
  type LogContext,
  type LogFields,
  type LogLevel,
} from "@/lib/logger/schema";
import type { Logger } from "@/lib/logger";

const GLOBAL_LEVEL: LogLevel = (LEVELS as readonly string[]).includes(process.env.LOG_LEVEL ?? "")
  ? (process.env.LOG_LEVEL as LogLevel)
  : "info";
const SERVICE = process.env.LOG_SERVICE || "gameops-web";
const ENVIRONMENT = process.env.NODE_ENV || "development";
const RELEASE = process.env.LOG_RELEASE || undefined;

function emit(module: string, ctx: LogContext | undefined, level: LogLevel, msg: string, fields?: LogFields): void {
  try {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[GLOBAL_LEVEL]) return;
    const cleanMsg = clampString(scrubString(msg ?? ""), LIMITS.string).value;
    const record: Record<string, unknown> = {
      schemaVersion: SCHEMA_VERSION,
      ts: new Date().toISOString(),
      level,
      service: SERVICE,
      environment: ENVIRONMENT,
      ...(RELEASE ? { release: RELEASE } : {}),
      ...assembleFields(module, fields, ctx),
      msg: cleanMsg,
    };
    capRecordSize(record, cleanMsg);
    // eslint-disable-next-line no-console -- Edge 仅有 console 作为 stdout 出口
    console.log(JSON.stringify(record));
  } catch {
    // eslint-disable-next-line no-console
    console.error(`[logger.edge] emit 失败 module=${module}`);
  }
}

/** 建一个 Edge logger;可绑定该请求的链路上下文(requestId 等)。 */
export function createEdgeLogger(module: string, context?: LogContext): Logger {
  return {
    trace: (m, f) => emit(module, context, "trace", m, f),
    debug: (m, f) => emit(module, context, "debug", m, f),
    info: (m, f) => emit(module, context, "info", m, f),
    warn: (m, f) => emit(module, context, "warn", m, f),
    error: (m, f) => emit(module, context, "error", m, f),
    fatal: (m, f) => emit(module, context, "fatal", m, f),
  };
}
