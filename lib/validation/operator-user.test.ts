import { describe, expect, it } from "vitest";
import { operatorUserCreateSchema, operatorProfileUpdateSchema, operatorUserUpdateSchema } from "./operator-user";
import { registerSchema } from "./auth";

const input = { username: "ops.wang-01", displayName: "运营小王", password: "secret123", role: "OPERATOR" };

describe("运营账户名称边界", () => {
  it("显示用户名支持中文、去除首尾空格,账号规则维持原样", () => {
    expect(operatorUserCreateSchema.parse({ ...input, displayName: "  运营 小王  " }).displayName).toBe("运营 小王");
    expect(operatorUserCreateSchema.safeParse({ ...input, role: "ADMIN" }).success).toBe(true);
    expect(operatorUserCreateSchema.safeParse({ ...input, role: "REVIEWER" }).success).toBe(true);
    for (const username of ["中文账号", "ab", "a".repeat(33), "ops wang", "ops@wang"]) {
      expect(operatorUserCreateSchema.safeParse({ ...input, username }).success).toBe(false);
    }
  });

  it("拒绝空白、超长及含控制字符的显示用户名", () => {
    for (const displayName of ["", "   ", "王".repeat(33), "小\n王", "小\u200b王"]) {
      expect(operatorProfileUpdateSchema.safeParse({ displayName }).success).toBe(false);
    }
  });

  it("自助修改只接收昵称,不能夹带账号、角色或其他人的 ID", () => {
    for (const extra of [{ username: "new-login" }, { accountName: "new-login" }, { role: "ADMIN" }, { id: "other" }]) {
      expect(operatorProfileUpdateSchema.safeParse({ displayName: "小王", ...extra }).success).toBe(false);
    }
    expect(operatorUserUpdateSchema.safeParse({ role: "OPERATOR", username: "new-login" }).success).toBe(false);
  });

  it("创作者的用户名和昵称注册规则保持原样", () => {
    expect(registerSchema.safeParse({ username: "创作者账号", nickname: "昵称", email: "creator@example.com",
      password: "secret123", confirmPassword: "secret123" }).success).toBe(true);
  });
});
