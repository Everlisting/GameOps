/**
 * Error 与 HTTP 请求的白名单归一化(纯函数,Edge 与 Node 共用)。
 * 只挑允许字段,配合 redact.ts 的递归兜底构成 §6.3 双层防护。
 */
import { LIMITS, type NormalizedError } from "@/lib/logger/schema";
import { clampString, scrubString } from "@/lib/logger/redact";

/** 把任意抛出物归一化为 { name, message, code, stack },已脱敏且已限长。 */
export function normalizeError(input: unknown): NormalizedError | undefined {
  if (input == null) return undefined;

  if (input instanceof Error) {
    const anyErr = input as Error & { code?: unknown };
    const out: NormalizedError = { name: input.name };
    const msg = clampString(scrubString(input.message ?? ""), LIMITS.errMessage);
    if (msg.value) out.message = msg.value;
    if (typeof anyErr.code === "string" || typeof anyErr.code === "number") {
      out.code = String(anyErr.code);
    }
    if (typeof input.stack === "string") {
      const st = clampString(scrubString(input.stack), LIMITS.errStack);
      out.stack = st.value;
      if (st.truncated) out.truncated = true;
    }
    if (msg.truncated) out.truncated = true;
    return out;
  }

  // 非 Error(字符串 / 对象等):至少保留一条脱敏消息
  const msg = clampString(scrubString(typeof input === "string" ? input : safeStringify(input)), LIMITS.errMessage);
  return { message: msg.value, ...(msg.truncated ? { truncated: true } : {}) };
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return "[unserializable]";
  }
}

/**
 * 从原始 URL 提取规范化 route 模板(不带 query,cuid/数字/uuid 段替换为 :id)。
 * 优先使用调用方已知的 route 模板;这里只是兜底。
 */
export function normalizeRoute(pathname: string): string {
  return pathname
    .split("/")
    .map((seg) => {
      if (!seg) return seg;
      if (/^c[a-z0-9]{20,}$/i.test(seg)) return ":id"; // cuid
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg)) return ":id"; // uuid
      if (/^\d+$/.test(seg)) return ":id";
      return seg;
    })
    .join("/");
}
