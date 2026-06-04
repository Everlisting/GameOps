/**
 * Edge 安全的会话工具:只依赖 jose,可在 middleware(Edge 运行时)中 import。
 *
 * ⚠️ 本文件禁止 import argon2 / prisma / 任何 Node 原生模块,
 *    否则 middleware 打包会报 node:crypto 之类错误。
 *    需要密码哈希、cookie 读写等 Node 能力的逻辑放在 lib/auth.ts。
 */
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/validation/env";
import type { Role } from "@prisma/client";

const SECRET = new TextEncoder().encode(env.AUTH_SECRET);
export const COOKIE_NAME = "session";
export const MAX_AGE = 60 * 60 * 24 * 7; // 7 天

export interface SessionPayload {
  sub: string;
  username: string;
  role: Role;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(SECRET);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      sub: payload.sub as string,
      username: payload.username as string,
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}
