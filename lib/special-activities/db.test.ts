import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
import { estimateActivity } from "./db";
import type { SpecialActivityInput } from "./rules";

const input: SpecialActivityInput = {
  title: "审核结算", description: "", startDate: "2026-07-01", endDate: "2026-07-31",
  filters: { match: "ALL", rules: [] }, settlementMode: "CONFIRMATION", cutoffAt: null,
  pools: [{ name: "逐稿", exclusiveGroup: "", steps: [{ kind: "FIXED", amount: 10 }] }],
};
const base = {
  id: "approved", externalId: "1", title: "稿件", url: "https://example.com", platform: "douyin",
  creatorUid: "a", creatorName: "作者", creatorAccount: null, publishedAt: new Date("2026-07-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"), lastDatasetId: null,
  reviewStatus: "APPROVED", reviewedAt: new Date("2026-08-01T01:00:00Z"), dailyStats: [],
  views: 100, recommendedViews: 100, likes: 0, comments: 0, shares: 0, fansGained: 0,
};
const db = { videoStat: { findMany: mocks.findMany } };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation((callback) => callback(db));
});

describe("专题活动预估审核联动", () => {
  it("匹配明细保留全部稿件，未通过稿件的缺失截止指标不阻断结算", async () => {
    mocks.findMany.mockResolvedValue([
      { ...base, updatedAt: new Date("2026-07-31T00:00:00Z") },
      { ...base, id: "pending", reviewStatus: "PENDING", creatorUid: null },
      { ...base, id: "rejected", reviewStatus: "REJECTED", creatorUid: null },
    ]);
    const result = await estimateActivity({ ...input, settlementMode: "CUTOFF", cutoffAt: "2026-08-01T00:00" }, new Date("2026-08-03T00:00:00Z"));
    expect(result.videos).toHaveLength(3);
    expect(result.reviewCounts).toEqual({ approved: 1, pending: 1, rejected: 1 });
    expect(result.reviewPolicy).toBe("APPROVED_ONLY");
    expect(result.missingData).toBe(0);
    expect(result.missingUid).toBe(0);
    expect(result.result.totalCents).toBe(1000);
  });

  it("审核改判改变预估指纹及金额，审核字段被保存在稿件快照中", async () => {
    mocks.findMany.mockResolvedValue([base]);
    const approved = await estimateActivity(input);
    mocks.findMany.mockResolvedValue([{ ...base, reviewStatus: "REJECTED" }]);
    const rejected = await estimateActivity(input);
    expect(approved.fingerprint).not.toBe(rejected.fingerprint);
    expect(approved.result.totalCents).toBe(1000);
    expect(rejected.result.totalCents).toBe(0);
    expect(approved.videos[0]).toMatchObject({ reviewStatus: "APPROVED", reviewedAt: "2026-08-01T01:00:00.000Z" });
  });
});
