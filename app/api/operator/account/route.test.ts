import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), update: vi.fn(), findUnique: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession, hashPassword: vi.fn().mockResolvedValue("hash") }));
vi.mock("@/lib/db", () => ({ prisma: { user: { update: mocks.update, findUnique: mocks.findUnique, create: mocks.create } } }));

import { PATCH } from "./route";
import { POST } from "@/app/api/admin/operators/route";

function request(body: unknown, method = "PATCH") {
  return new Request("http://localhost/api/operator/account", {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ sub: "self", username: "ops.wang", role: "OPERATOR" });
  mocks.update.mockResolvedValue({ id: "self", username: "ops.wang", displayName: "运营小王" });
  mocks.findUnique.mockResolvedValue(null);
});

describe("运营用户名 API", () => {
  it.each(["REVIEWER", "OPERATOR", "ADMIN"])("%s 只能更新自己的显示用户名", async (role) => {
    mocks.getSession.mockResolvedValue({ sub: "self", username: "ops.wang", role });
    const response = await PATCH(request({ displayName: "  运营小王  " }), {});
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "self" }, data: { displayName: "运营小王" },
      select: { id: true, username: true, displayName: true } });
  });

  it.each([null, { sub: "creator", username: "creator", role: "CREATOR" }])("拒绝未登录用户及创作者", async (session) => {
    mocks.getSession.mockResolvedValue(session);
    const response = await PATCH(request({ displayName: "新名字" }), {});
    expect(response.status).toBe(session ? 403 : 401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("拒绝同时修改固定账号名称", async () => {
    const response = await PATCH(request({ displayName: "新名字", username: "new-login" }), {});
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("创建账户保留独立的固定账号和中文显示用户名", async () => {
    mocks.getSession.mockResolvedValue({ sub: "admin", username: "admin", role: "ADMIN" });
    mocks.create.mockResolvedValue({ id: "new" });
    const response = await POST(request({ username: "ops.wang", displayName: "运营小王", password: "secret123", role: "OPERATOR" }, "POST"), {});
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: {
      username: "ops.wang", displayName: "运营小王", passwordHash: "hash", role: "OPERATOR", status: "active",
    } }));
  });

  it("固定账号已占用时返回冲突", async () => {
    mocks.getSession.mockResolvedValue({ sub: "admin", username: "admin", role: "ADMIN" });
    mocks.findUnique.mockResolvedValue({ id: "existing" });
    const response = await POST(request({ username: "ops.wang", displayName: "另一个昵称", password: "secret123", role: "ADMIN" }, "POST"), {});
    expect(response.status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
