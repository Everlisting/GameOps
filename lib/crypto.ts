/**
 * 对称加密工具:用于加密舆情监控里的 LLM apiKey 等敏感串。
 *
 * 算法:AES-256-GCM(附带完整性校验的认证加密)。
 * 主密钥来源:环境变量 `OPINION_AES_KEY`,32 字节的 base64 编码。
 *   生成:node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * 密文串格式(单串,base64):[12 字节 IV][ciphertext...][16 字节 authTag]
 *   → 解密时按位置切分,任何一段被改都会 GCM 校验失败。
 *
 * 使用约束:
 *   - 只用于长度 <= 8KB 的短密钥/token;不要拿去加密大文件。
 *   - 主密钥丢了 = 所有密文永久无法解出;备份进阿里云 KMS / 密码管理器。
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { AppError } from "@/lib/errors";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;   // GCM 推荐 96 bit
const TAG_LEN = 16;  // GCM 默认 128 bit
const KEY_LEN = 32;  // AES-256

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.OPINION_AES_KEY;
  if (!raw) {
    throw new AppError("INTERNAL", "缺少环境变量 OPINION_AES_KEY");
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_LEN) {
    throw new AppError(
      "INTERNAL",
      `OPINION_AES_KEY 需要 ${KEY_LEN} 字节 base64 编码(当前 ${buf.length} 字节)`,
    );
  }
  cachedKey = buf;
  return buf;
}

/** 测试专用:清缓存,让下次调用重新读 env。仅测试内部用。 */
export function _resetKeyCacheForTest(): void {
  cachedKey = null;
}

/** 加密明文,返回单个 base64 串(含 IV + 密文 + tag)。 */
export function encryptSecret(plain: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString("base64");
}

/** 解密 encryptSecret 产出的串,失败(密钥不对 / 密文被篡改)抛 AppError。 */
export function decryptSecret(enc: string): string {
  if (!enc) throw new AppError("BAD_REQUEST", "密文为空,无法解密");
  const key = loadKey();
  const all = Buffer.from(enc, "base64");
  // 最小合法长度 = IV + tag(明文可为空,body 为 0 字节)
  if (all.length < IV_LEN + TAG_LEN) {
    throw new AppError("BAD_REQUEST", "密文长度非法");
  }
  const iv = all.subarray(0, IV_LEN);
  const tag = all.subarray(all.length - TAG_LEN);
  const ct = all.subarray(IV_LEN, all.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    throw new AppError("BAD_REQUEST", "密文完整性校验失败(密钥不对或密文被改)");
  }
}

/**
 * 打码展示 apiKey:前 3 后 4,中间统一 `****`。
 * - 长度 <= 7 的整体打码为 `****`
 * - 用于 UI 回显和审计 details,避免明文泄露
 */
export function maskApiKey(plain: string): string {
  if (!plain) return "";
  const s = plain.trim();
  if (s.length <= 7) return "****";
  return `${s.slice(0, 3)}****${s.slice(-4)}`;
}
