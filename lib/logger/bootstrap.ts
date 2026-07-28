/**
 * 最小兜底 logger:只同步写 stderr,永不进入 pino/DB/告警等派生 sink。
 * 用于 logger 初始化失败、脱敏/序列化自身异常、sink 写入失败、fatal flush 失败。
 * 详见 docs/logging.md §9.1。刻意零依赖、绝不抛错。
 */
import { SCHEMA_VERSION } from "@/lib/logger/schema";

export function bootstrapLog(
  level: "error" | "fatal" | "warn",
  msg: string,
  fields?: Record<string, unknown>,
): void {
  try {
    const rec = {
      schemaVersion: SCHEMA_VERSION,
      ts: new Date().toISOString(),
      level,
      module: "logger.bootstrap",
      sinkInternal: true,
      msg,
      ...(fields ? { fields } : {}),
    };
    process.stderr.write(JSON.stringify(rec) + "\n");
  } catch {
    // 最后防线:序列化都失败也不能抛
    try {
      process.stderr.write(`[logger.bootstrap] ${level}: ${msg}\n`);
    } catch {
      /* 放弃 */
    }
  }
}
