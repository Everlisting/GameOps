/** Edge 安全的角色定义:页面分流与服务端 RBAC 共用,不依赖数据库。 */
import type { Role } from "@prisma/client";

export const STAFF_ROLES = ["REVIEWER", "OPERATOR", "ADMIN"] as const;

const LEVEL: Record<Role, number> = { CREATOR: 0, REVIEWER: 1, OPERATOR: 2, ADMIN: 3 };

/** ADMIN ⊃ OPERATOR ⊃ REVIEWER;创作者独立。 */
export function hasRole(role: Role, required: Role): boolean {
  if (required === "CREATOR") return role === "CREATOR";
  return role !== "CREATOR" && LEVEL[role] >= LEVEL[required];
}

export function homePathForRole(role: Role): string {
  if (role === "CREATOR") return "/dashboard";
  if (role === "REVIEWER") return "/operator/submissions";
  return "/operator/dashboard";
}

/** 审核角色的页面范围。仍需每个接口独立执行 requireRole。 */
export function canAccessStaffPage(role: Role, pathname: string): boolean {
  if (!hasRole(role, "REVIEWER")) return false;
  if (role !== "REVIEWER") return true;
  if (["/operator/account", "/operator/submissions", "/operator/submissions/review", "/operator/submissions/periods"].includes(pathname)) return true;
  return /^\/operator\/submissions\/periods\/[^/]+$/.test(pathname)
    && pathname !== "/operator/submissions/periods/new";
}
