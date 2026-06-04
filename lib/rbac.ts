/**
 * RBAC:基于角色层级的访问控制。
 *
 * 层级:ADMIN ⊃ OPERATOR。CREATOR 为独立对外角色。
 * 判断规则:用户角色等级 >= 所需最低角色等级 即放行。
 */
import type { Role } from "@prisma/client";
import { forbidden, unauthorized } from "@/lib/errors";
import { getSession, type SessionPayload } from "@/lib/auth";

/** 角色等级。数值越大权限越高。CREATOR 与 OPERATOR/ADMIN 是两条线,
 *  但因 CREATOR 只访问创作者端、OPERATOR/ADMIN 访问运营端,用等级即可表达"运营端最低门槛"。*/
const LEVEL: Record<Role, number> = {
  CREATOR: 1,
  OPERATOR: 2,
  ADMIN: 3,
};

/** 判断 role 是否满足所需的最低角色 */
export function hasRole(role: Role, required: Role): boolean {
  // 运营端门槛:required 为 OPERATOR/ADMIN 时,按等级比较
  // 创作者端门槛:required 为 CREATOR 时,仅 CREATOR 放行(运营不混入创作者端)
  if (required === "CREATOR") return role === "CREATOR";
  return LEVEL[role] >= LEVEL[required];
}

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

/** 登录后应跳转的首页(按角色分流) */
export function homePathForRole(role: Role): string {
  if (role === "CREATOR") return "/dashboard"; // 创作者端
  return "/operator/dashboard"; // 运营/管理员端(实际路由见 app 结构)
}
