import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  tags: vi.fn(),
  lock: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
    submission: {
      findUnique: mocks.findUnique,
      findMany: mocks.findMany,
      count: mocks.count,
    },
  },
}));
import { PATCH, GET as GET_DETAIL } from "./[id]/route";
import { GET as GET_LIST } from "./route";
import { POST } from "./batch/route";

function request(body: unknown) {
  return new Request("http://localhost/api/operator/submissions/id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({
    sub: "reviewer",
    username: "reviewer",
    role: "OPERATOR",
  });
  const row = {
    id: "s1",
    titleStatus: "PENDING",
    contentStatus: "APPROVED",
    yishanStatus: "APPROVED",
  };
  mocks.findUnique.mockResolvedValue(row);
  mocks.findMany.mockResolvedValue([row]);
  mocks.count.mockResolvedValue(1);
  mocks.tags.mockResolvedValue([]);
  mocks.update.mockResolvedValue({ id: "s1", status: "APPROVED" });
  mocks.transaction.mockImplementation(
    async (run: (tx: unknown) => Promise<unknown>) =>
      run({
        $executeRaw: mocks.lock,
        reviewTag: { findMany: mocks.tags },
        submission: {
          findUnique: mocks.findUnique,
          findMany: mocks.findMany,
          update: mocks.update,
        },
      }),
  );
});

describe("旧征稿接口权限", () => {
  it("审核员无法通过旧征稿接口绕过分配限制", async () => {
    mocks.getSession.mockResolvedValue({ sub: "r1", username: "reviewer", role: "REVIEWER" });
    expect((await GET_LIST(new Request("http://localhost/api/operator/submissions"), {})).status).toBe(403);
    expect((await GET_DETAIL(new Request("http://localhost/api/operator/submissions/s1"), { params: { id: "s1" } })).status).toBe(403);
    expect((await PATCH(request({ title: { status: "APPROVED" } }), { params: { id: "s1" } })).status).toBe(403);
    expect((await POST(request({ ids: ["s1"], field: "title", status: "APPROVED" }), {})).status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("运营访问旧列表和详情时仍不加载作者或用户资料", async () => {
    const response = await GET_DETAIL(
      new Request("http://localhost/api/operator/submissions/s1"),
      { params: { id: "s1" } },
    );
    expect(response.status).toBe(200);
    const detailSelect = mocks.findUnique.mock.calls[0][0].select;
    expect(detailSelect).not.toHaveProperty("creator");
    expect(detailSelect).toHaveProperty("reviewTags");
    const listResponse = await GET_LIST(
      new Request("http://localhost/api/operator/submissions"),
      {},
    );
    expect(listResponse.status).toBe(200);
    expect(mocks.findMany.mock.calls[0][0].select).not.toHaveProperty(
      "creator",
    );
    expect(await response.json()).not.toHaveProperty("creator");
    expect((await listResponse.json()).items[0]).not.toHaveProperty("creator");
  });
  it("可单条审核并派生最终状态", async () => {
    const response = await PATCH(
      request({ title: { status: "APPROVED", note: "通过" } }),
      { params: { id: "s1" } },
    );
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: expect.objectContaining({
          titleStatus: "APPROVED",
          titleNote: "通过",
          status: "APPROVED",
        }),
      }),
    );
  });

  it("可批量审核", async () => {
    const response = await POST(
      request({ ids: ["s1"], field: "title", status: "APPROVED" }),
      {},
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updatedCount: 1, missingIds: [] });
  });

  it("禁止新增停用祖先下的标签，同时保留已关联的历史标签", async () => {
    mocks.tags.mockResolvedValue([
      {
        id: "root",
        name: "root",
        description: "",
        sortOrder: 0,
        enabled: false,
        parentId: null,
      },
      {
        id: "child",
        name: "child",
        description: "",
        sortOrder: 0,
        enabled: true,
        parentId: "root",
      },
    ]);
    mocks.findUnique.mockResolvedValue({
      id: "s1",
      reviewTags: [],
      titleStatus: "PENDING",
      contentStatus: "APPROVED",
      yishanStatus: "APPROVED",
    });
    expect(
      (await PATCH(request({ tagIds: ["child"] }), { params: { id: "s1" } }))
        .status,
    ).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.findUnique.mockResolvedValue({
      id: "s1",
      reviewTags: [{ id: "child" }],
      titleStatus: "PENDING",
      contentStatus: "APPROVED",
      yishanStatus: "APPROVED",
    });
    expect(
      (await PATCH(request({ tagIds: ["child"] }), { params: { id: "s1" } }))
        .status,
    ).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewTags: { set: [{ id: "child" }] },
        }),
      }),
    );
  });

  it("只修改标签时保留三项审核状态，支持清空标签", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "s1",
      reviewTags: [{ id: "old" }],
      titleStatus: "APPROVED",
      contentStatus: "APPROVED",
      yishanStatus: "APPROVED",
    });
    expect(
      (await PATCH(request({ tagIds: [] }), { params: { id: "s1" } })).status,
    ).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "APPROVED",
          reviewTags: { set: [] },
        }),
      }),
    );
  });

  it("创作者不能调用单条和批量审核接口", async () => {
    mocks.getSession.mockResolvedValue({
      sub: "creator",
      username: "creator",
      role: "CREATOR",
    });
    expect(
      (
        await PATCH(request({ title: { status: "APPROVED" } }), {
          params: { id: "s1" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await POST(
          request({ ids: ["s1"], field: "title", status: "APPROVED" }),
          {},
        )
      ).status,
    ).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
