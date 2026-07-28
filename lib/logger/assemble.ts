/**
 * 组装一条日志的字段(纯函数,Edge 与 Node 共用)。
 * 输入:module + 调用点 fields + 链路上下文;输出:除 level/ts/msg 外的所有落盘字段。
 * 已知业务键放顶层,其余进 fields 桶并递归脱敏;raw 身份键一律丢弃(只允许 *Hash)。
 */
import { normalizeError } from "@/lib/logger/normalize";
import { scrubValue, clampString } from "@/lib/logger/redact";
import {
  LIMITS,
  isKnownTopLevel,
  type LogContext,
  type LogFields,
} from "@/lib/logger/schema";

/** 绝不落明文的原始身份键——调用方应改用上下文里的 *Hash。 */
const DROP_KEYS = new Set(["userid", "chatid", "username", "email", "phone", "mobile", "tel"]);

export interface AssembledFields {
  module: string;
  [key: string]: unknown;
}

export function assembleFields(
  module: string,
  fields: LogFields | undefined,
  context: LogContext | undefined,
): AssembledFields {
  const out: AssembledFields = { module };

  // 1) 链路上下文(会被调用点同名字段覆盖)
  if (context) {
    for (const [k, v] of Object.entries(context)) {
      if (v !== undefined && v !== null) out[k] = v;
    }
  }

  if (!fields) return out;

  const bucket: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(fields)) {
    if (val === undefined) continue;
    if (key === "err") {
      const err = normalizeError(val);
      if (err) out.err = err;
      continue;
    }
    if (key === "persist") {
      if (val === true) out.persist = true;
      continue;
    }
    if (DROP_KEYS.has(key.toLowerCase())) continue; // 原始身份键丢弃
    if (isKnownTopLevel(key)) {
      out[key] =
        typeof val === "string" ? clampString(val, LIMITS.string).value : (scrubValue(val) as unknown);
      continue;
    }
    bucket[key] = val;
  }

  const scrubbed = scrubValue(bucket) as Record<string, unknown>;
  if (scrubbed && Object.keys(scrubbed).length > 0) out.fields = scrubbed;

  return out;
}

/** 整条超 §6.5 上限时,丢弃 fields 桶并标记 truncated,保证 record 不失控。 */
export function capRecordSize(emit: Record<string, unknown>, msg: string): void {
  let size: number;
  try {
    size = JSON.stringify(emit).length + msg.length;
  } catch {
    size = 0;
  }
  if (size > LIMITS.record) {
    emit.fields = "[record-truncated]";
    emit.truncated = true;
  }
}
