import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { canAccessStaffPage, hasRole, homePathForRole } from "./roles";

const permissions: Record<Role, Role[]> = {
  CREATOR: ["CREATOR"], REVIEWER: ["REVIEWER"],
  OPERATOR: ["REVIEWER", "OPERATOR"], ADMIN: ["REVIEWER", "OPERATOR", "ADMIN"],
};

describe("角色权限边界", () => {
  for (const role of Object.values(Role)) {
    it(`${role} 的访问范围`, () => {
      for (const required of Object.values(Role)) {
        expect(hasRole(role, required)).toBe(permissions[role].includes(required));
      }
    });
  }

  it("审核角色首页是稿件页,现有角色分流保持原样", () => {
    expect(homePathForRole("REVIEWER")).toBe("/operator/submissions");
    expect(homePathForRole("CREATOR")).toBe("/dashboard");
    expect(homePathForRole("OPERATOR")).toBe("/operator/dashboard");
    expect(homePathForRole("ADMIN")).toBe("/operator/dashboard");
  });

  it("审核页面只开放稿件列表、详情和个人账户", () => {
    for (const path of ["/operator/submissions", "/operator/submissions/review", "/operator/submissions/periods/test-period", "/operator/account"]) {
      expect(canAccessStaffPage("REVIEWER", path)).toBe(true);
    }
    for (const path of ["/operator/submissions/submission-id", "", "/operator/dashboard", "/operator/submissions/tags", "/operator/submissions/import-yishan", "/operator/submissions-extra",
      "/operator/submissions/periods/new", "/operator/submissions/periods/test-period/edit",
      "/operator/creators", "/operator/activities", "/operator/assistant", "/operator/tasks", "/operator/admin/operators"]) {
      expect(canAccessStaffPage("REVIEWER", path)).toBe(false);
    }
    expect(canAccessStaffPage("OPERATOR", "/operator/tasks")).toBe(true);
    expect(canAccessStaffPage("CREATOR", "/operator/submissions")).toBe(false);
  });
});
