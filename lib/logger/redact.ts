/**
 * 脱敏兜底(纯函数,Edge 与 Node 共用,不引 Node 内建)。
 * 详见 docs/logging.md §6:白名单为主,这里是「递归兜底 + 值模式 + 大小限制」。
 * 白名单序列化在 normalize.ts / index.ts;本文件保证即使字段漏进来也不落密。
 */
import { LIMITS } from "@/lib/logger/schema";

export const REDACTED = "[redacted]";

// ── 敏感键名匹配(大小写不敏感,忽略 - _ 空格差异)──────────────────────
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, "");
}
const KEY_CONTAINS = [
  "authorization",
  "cookie",
  "password",
  "passwd",
  "secret",
  "apikey",
  "apisecret",
  "privatekey",
  "accesstoken",
  "refreshtoken",
  "sessiontoken",
  "bearer",
  "credential",
];
const KEY_ENDSWITH = ["token", "secret", "apikey", "enc", "password"];
const KEY_EXACT = new Set(["token", "jwt", "auth", "sid", "sessionid", "encryptkey", "verificationtoken", "aeskey"]);

export function isSensitiveKey(key: string): boolean {
  const k = normalizeKey(key);
  if (KEY_EXACT.has(k)) return true;
  if (KEY_CONTAINS.some((s) => k.includes(s))) return true;
  if (KEY_ENDSWITH.some((s) => k.endsWith(s))) return true;
  return false;
}

// ── 值模式兜底(只是兜底,不替代白名单)────────────────────────────────
const VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/https:\/\/open\.feishu\.cn\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9_-]+/g, "[feishu-webhook]"],
  [/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, "[jwt]"],
  [/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]"],
  [/\b(?:sk|xoxb|xoxp|ghp|gho)-[A-Za-z0-9_-]{10,}\b/g, "[api-key]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  [/(?<![0-9])1[3-9]\d{9}(?![0-9])/g, "[phone]"],
];

/** 对字符串做值模式脱敏(手机号/邮箱/JWT/Bearer/飞书 webhook 等)。 */
export function scrubString(input: string): string {
  let s = input;
  for (const [re, rep] of VALUE_PATTERNS) s = s.replace(re, rep);
  return s;
}

/** 限长;返回是否截断。 */
export function clampString(input: string, max: number): { value: string; truncated: boolean } {
  if (input.length <= max) return { value: input, truncated: false };
  return { value: input.slice(0, max) + "…", truncated: true };
}

/**
 * 递归脱敏 + 限深/限项/限长。用于 fields 桶等不可信/半可信对象。
 * 敏感键 → [redacted];字符串走值模式 + 限长;数组限项;超深截断;循环引用兜底。
 */
export function scrubValue(input: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (input === null) return null;
  const t = typeof input;
  if (t === "string") {
    const { value } = clampString(scrubString(input as string), LIMITS.string);
    return value;
  }
  if (t === "number" || t === "boolean") return input;
  if (t === "bigint") return (input as bigint).toString();
  if (t === "undefined" || t === "function" || t === "symbol") return undefined;
  if (input instanceof Date) return input.toISOString();

  if (depth >= LIMITS.depth) return "[depth-limited]";

  if (Array.isArray(input)) {
    if (seen.has(input)) return "[circular]";
    seen.add(input);
    const out = input.slice(0, LIMITS.arrayItems).map((v) => scrubValue(v, depth + 1, seen));
    if (input.length > LIMITS.arrayItems) out.push(`[+${input.length - LIMITS.arrayItems} more]`);
    seen.delete(input);
    return out;
  }

  if (t === "object") {
    const obj = input as Record<string, unknown>;
    if (seen.has(obj)) return "[circular]";
    seen.add(obj);
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (isSensitiveKey(key)) {
        out[key] = REDACTED;
        continue;
      }
      const scrubbed = scrubValue(val, depth + 1, seen);
      if (scrubbed !== undefined) out[key] = scrubbed;
    }
    seen.delete(obj);
    return out;
  }

  return undefined; // 其它未知类型丢弃
}
