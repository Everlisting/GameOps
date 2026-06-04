/**
 * 认证(Node 侧):密码哈希(argon2)+ cookie 读写。
 *
 * ⚠️ 本文件含 argon2(Node 原生),禁止被 middleware 直接或间接 import。
 *    middleware 只用 lib/session.ts。
 *
 * JWT 签发/校验在 lib/session.ts(Edge 安全),这里重新导出方便统一引用。
 */
import argon2 from "argon2";
import { cookies } from "next/headers";
import { env } from "@/lib/validation/env";
import {
  signSession,
  verifySession,
  COOKIE_NAME,
  MAX_AGE,
  type SessionPayload,
} from "@/lib/session";

export { signSession, verifySession, COOKIE_NAME, type SessionPayload };

/* ── 密码 ── */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}
export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

/* ── Cookie(仅 Route Handler / Server Component 可用)── */
export async function setSessionCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE_NAME);
}

/** 从 cookie 读取并校验当前会话,无效返回 null */
export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}
