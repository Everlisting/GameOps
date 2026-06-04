/**
 * Agent token 生成与封装。
 *
 * 格式:`<agentId>.<secret>`(secret 为 base64url 编码的 20 字节随机串)
 *   - 完整 token 仅在「创建」或「重置」时返回给管理员一次,前端必须立刻让其保存
 *   - 服务端只存 secret 段的 argon2 哈希
 */
import crypto from "node:crypto";

/** 生成 secret 段:20 字节随机 → base64url(约 27 字符,URL-safe) */
export function generateAgentSecret(): string {
  return crypto.randomBytes(20).toString("base64url");
}

/** 拼装完整 token */
export function buildAgentToken(agentId: string, secret: string): string {
  return `${agentId}.${secret}`;
}
