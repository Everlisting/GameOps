/**
 * 标识符去身份化(仅 Node)。userId/chatId 需聚合时用 HMAC-SHA256,
 * 输出 userIdHash/chatIdHash;未配置 LOG_HASH_SECRET 时返回 undefined(省略,不落明文)。
 * 详见 docs/logging.md §6.4。
 */
import { createHmac } from "node:crypto";

let secret: string | null | undefined;
function getSecret(): string | null {
  if (secret === undefined) secret = process.env.LOG_HASH_SECRET || null;
  return secret;
}

/** 对标识符做 HMAC;无密钥或空值 → undefined。取前 16 字节 hex(32 位)足够聚合去重。 */
export function hashIdentifier(value: string | null | undefined): string | undefined {
  const s = getSecret();
  if (!s || !value) return undefined;
  return createHmac("sha256", s).update(value).digest("hex").slice(0, 32);
}
