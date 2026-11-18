import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(), update: vi.fn(), audit: vi.fn(), transaction: vi.fn(), lock: vi.fn(), estimate: vi.fn(), input: vi.fn(),
}));
vi.mock("@/lib/rbac", () => ({ requireRole: async () => ({ sub: "op", username: "operator", role: "OPERATOR" }) }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/video-review-access", () => ({ lockReviewAssignments: mocks.lock }));
vi.mock("@/lib/special-activities/db", () => ({
  ACTIVITY_TRANSACTION_TIMEOUT_MS: 60000, activityInput: mocks.input, activityValues: vi.fn(), estimateActivity: mocks.estimate,
}));
import { POST } from "./route";

const fingerprint = "a".repeat(64);
const tx = { specialActivity: { findUnique: mocks.find, updateMany: mocks.update }, auditLog: { create: mocks.audit } };
const estimate = {
  videos: [{ id: "v", reviewStatus: "APPROVED" }], reviewPolicy: "APPROVED_ONLY",
  reviewCounts: { approved: 1, pending: 0, rejected: 3 }, missingData: 0,
  result: { totalCents: 1000 }, fingerprint, dataAt: null,
};
const confirm = () => POST(new Request("http://localhost/api/operator/special-activities/a", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fingerprint }),
}), { params: { id: "a" } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation((callback) => callback(tx));
  mocks.find.mockResolvedValue({ id: "a", revision: 1, settledAt: null, cutoffAt: null });
  mocks.input.mockReturnValue({ endDate: "2020-01-01" });
  mocks.estimate.mockResolvedValue(estimate);
  mocks.update.mockResolvedValue({ count: 1 });
});

describe("专题活动审核结算确认", () => {
  it("使用审核共用锁重算，冻结通过稿件口径并写入审计", async () => {
    expect((await confirm()).status).toBe(200);
    expect(mocks.lock).toHaveBeenCalledWith(tx);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.estimate.mock.invocationCallOrder[0]);
    expect(mocks.update.mock.calls[0][0].data.settlement).toMatchObject({ version: 2, estimate: { reviewPolicy: "APPROVED_ONLY" } });
    expect(mocks.audit.mock.calls[0][0].data.details.reviewCounts).toEqual(estimate.reviewCounts);
  });

  it("全部稿件未通过时拒绝确认，不冻结金额", async () => {
    mocks.estimate.mockResolvedValue({ ...estimate, reviewCounts: { approved: 0, pending: 0, rejected: 6 } });
    const response = await confirm();
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("没有审核通过的稿件");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("审核变化导致指纹不一致时返回冲突并要求重新预估", async () => {
    mocks.estimate.mockResolvedValue({ ...estimate, fingerprint: "b".repeat(64) });
    expect((await confirm()).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([1, 5])("即使存在通过稿件，仍有 %i 条待审时也禁止结算", async (pending) => {
    mocks.estimate.mockResolvedValue({ ...estimate, reviewCounts: { approved: 1, pending, rejected: 3 } });
    const response = await confirm();
    expect(response.status).toBe(400);
    expect(await response.text()).toContain(`仍有 ${pending} 条稿件待审核`);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("全为待审稿件时提示先完成审核", async () => {
    mocks.estimate.mockResolvedValue({ ...estimate, reviewCounts: { approved: 0, pending: 4, rejected: 0 } });
    const response = await confirm();
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("全部完成审核后再确认结算");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("历史结算重复确认直接返回原结果", async () => {
    mocks.find.mockResolvedValue({ id: "a", settledAt: new Date("2020-02-01T00:00:00Z") });
    expect((await confirm()).status).toBe(200);
    expect(mocks.estimate).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
