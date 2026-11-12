/**
 * RBAC:基于角色层级的访问控制。
 *
 * 层级:ADMIN ⊃ OPERATOR ⊃ REVIEWER。CREATOR 为独立对外角色。
 * 判断规则:用户角色等级 >= 所需最低角色等级 即放行。
 */
import type { Role } from "@prisma/client";
import { forbidden, unauthorized } from "@/lib/errors";
import { getSession, type SessionPayload } from "@/lib/auth";
import { hasRole } from "@/lib/roles";
export { hasRole, homePathForRole } from "@/lib/roles";

/**
 * 在 Route Handler / Server Component 中要求登录 + 角色。
 * 不满足直接抛 AppError(由 handleApiError 接住)。
 */
export async function requireRole(required: Role): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw unauthorized("请先登录");
  if (!hasRole(session.role, required)) throw forbidden();
  return session;
}

/** 仅要求登录,不限角色 */
export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw unauthorized("请先登录");
  return session;
}
