import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
import { PATCH } from "./[id]/route";
import { POST } from "./batch/route";

function request(body: unknown) {
  return new Request("http://localhost/api/operator/submissions/id", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ sub: "reviewer", username: "reviewer", role: "REVIEWER" });
  const row = { id: "s1", titleStatus: "PENDING", contentStatus: "APPROVED", yishanStatus: "APPROVED" };
  mocks.findUnique.mockResolvedValue(row);
  mocks.findMany.mockResolvedValue([row]);
  mocks.update.mockResolvedValue({ id: "s1", status: "APPROVED" });
  mocks.transaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) => run({
    submission: { findUnique: mocks.findUnique, findMany: mocks.findMany, update: mocks.update },
  }));
});

describe("审核角色稿件接口", () => {
  it("可单条审核并派生最终状态", async () => {
    const response = await PATCH(request({ title: { status: "APPROVED", note: "通过" } }), { params: { id: "s1" } });
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "s1" },
      data: expect.objectContaining({ titleStatus: "APPROVED", titleNote: "通过", status: "APPROVED" }) }));
  });

  it("可批量审核", async () => {
    const response = await POST(request({ ids: ["s1"], field: "title", status: "APPROVED" }), {});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updatedCount: 1, missingIds: [] });
  });

  it("创作者不能调用单条和批量审核接口", async () => {
    mocks.getSession.mockResolvedValue({ sub: "creator", username: "creator", role: "CREATOR" });
    expect((await PATCH(request({ title: { status: "APPROVED" } }), { params: { id: "s1" } })).status).toBe(403);
    expect((await POST(request({ ids: ["s1"], field: "title", status: "APPROVED" }), {})).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
