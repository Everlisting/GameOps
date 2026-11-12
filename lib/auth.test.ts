import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cookie: vi.fn(), verify: vi.fn(), findUnique: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: mocks.cookie }) }));
vi.mock("@/lib/validation/env", () => ({ env: { AUTH_SECRET: "test-secret-with-at-least-32-characters" } }));
vi.mock("@/lib/session", () => ({ verifySession: mocks.verify, signSession: vi.fn(), COOKIE_NAME: "session", MAX_AGE: 604800 }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));

import { getSession } from "./auth";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookie.mockReturnValue({ value: "old-jwt" });
  mocks.verify.mockResolvedValue({ sub: "self", username: "ops.wang", role: "OPERATOR" });
});

describe("运营会话显示用户名", () => {
  it("旧 JWT 读取最新昵称,固定账号名称不变", async () => {
    mocks.findUnique.mockResolvedValue({ username: "ops.wang", displayName: "新昵称", role: "OPERATOR", status: "active" });
    expect(await getSession()).toEqual({ sub: "self", username: "ops.wang", displayName: "新昵称", role: "OPERATOR" });
  });

  it("已有账户未设置昵称时显示原账号", async () => {
    mocks.findUnique.mockResolvedValue({ username: "ops.wang", displayName: null, role: "ADMIN", status: "active" });
    expect(await getSession()).toMatchObject({ username: "ops.wang", displayName: "ops.wang", role: "ADMIN" });
  });

  it.each([null, { role: "OPERATOR", status: "disabled" }])("已删除/停用的运营不能继续修改资料", async (user) => {
    mocks.findUnique.mockResolvedValue(user);
    expect(await getSession()).toBeNull();
  });

  it("创作者会话保持原样", async () => {
    const creator = { sub: "creator", username: "creator", role: "CREATOR" };
    mocks.verify.mockResolvedValue(creator);
    expect(await getSession()).toEqual(creator);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("运营降为审核后,旧 JWT 也使用最新权限", async () => {
    mocks.findUnique.mockResolvedValue({ username: "ops.wang", displayName: "审核员", role: "REVIEWER", status: "active" });
    expect(await getSession()).toMatchObject({ role: "REVIEWER", displayName: "审核员" });
  });
});
