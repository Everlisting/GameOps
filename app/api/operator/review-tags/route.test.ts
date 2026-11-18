import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  lock: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("@/lib/audit", () => ({ recordAudit: mocks.audit }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
import { POST } from "./route";
import { PATCH, DELETE } from "./[id]/route";

const node = (id: string, parentId: string | null = null, enabled = true) => ({
  id,
  parentId,
  name: id,
  enabled,
  sortOrder: 0,
  description: "",
});
const request = (body: unknown) =>
  new Request("http://localhost/api/operator/review-tags/root", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({
    sub: "op",
    username: "op",
    role: "OPERATOR",
  });
  mocks.findMany.mockResolvedValue([
    node("root"),
    node("child", "root"),
    node("leaf", "child"),
  ]);
  mocks.findFirst.mockResolvedValue(null);
  mocks.findUnique.mockResolvedValue({
    ...node("root"),
    _count: { children: 0, submissions: 0 },
  });
  mocks.create.mockResolvedValue(node("new"));
  mocks.update.mockResolvedValue(node("root"));
  mocks.transaction.mockImplementation(
    async (run: (tx: unknown) => Promise<unknown>) =>
      run({
        $executeRaw: mocks.lock,
        reviewTag: {
          findMany: mocks.findMany,
          findUnique: mocks.findUnique,
          findFirst: mocks.findFirst,
          create: mocks.create,
          update: mocks.update,
          delete: mocks.remove,
        },
      }),
  );
});

describe("审核标签管理 API", () => {
  it("拒绝审核员和创作者修改标签", async () => {
    for (const role of ["REVIEWER", "CREATOR"]) {
      mocks.session.mockResolvedValue({ sub: "user", username: "user", role });
      expect((await POST(request({ name: "新标签" }), {})).status).toBe(403);
      expect(
        (await PATCH(request({ name: "新标签" }), { params: { id: "root" } }))
          .status,
      ).toBe(403);
      expect(
        (await DELETE(request({}), { params: { id: "root" } })).status,
      ).toBe(403);
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("阻止将父级移动到任意后代下", async () => {
    const response = await PATCH(request({ name: "root", parentId: "leaf" }), {
      params: { id: "root" },
    });
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("拒绝同级重名和无效父级", async () => {
    mocks.findFirst.mockResolvedValue(node("duplicate"));
    expect((await POST(request({ name: "duplicate" }), {})).status).toBe(409);
    mocks.findUnique.mockResolvedValue(null);
    expect(
      (await POST(request({ name: "新标签", parentId: "missing" }), {})).status,
    ).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("创建子标签并记录审计", async () => {
    const response = await POST(
      request({ name: "新标签", parentId: "root", sortOrder: 2 }),
      {},
    );
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "新标签",
        parentId: "root",
        sortOrder: 2,
      }),
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "reviewTag.create",
        actorUsername: "op",
      }),
    );
  });
  it("含子标签或已关联稿件时不能删除", async () => {
    for (const count of [
      { children: 1, submissions: 0 },
      { children: 0, submissions: 1 },
      { children: 0, submissions: 0, videos: 1 },
    ]) {
      mocks.findUnique.mockResolvedValue({ ...node("root"), _count: count });
      expect(
        (await DELETE(request({}), { params: { id: "root" } })).status,
      ).toBe(409);
    }
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("允许删除未使用的末级标签", async () => {
    expect((await DELETE(request({}), { params: { id: "root" } })).status).toBe(
      200,
    );
    expect(mocks.remove).toHaveBeenCalledWith({ where: { id: "root" } });
  });
});
