import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), activityInput: vi.fn(), estimate: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => Promise<unknown>) => fn }));
vi.mock("@/lib/db", () => ({ prisma: { specialActivity: { findUnique: mocks.findUnique } } }));
vi.mock("./db", () => ({ activityInput: mocks.activityInput, estimateActivity: mocks.estimate }));

import { activityCardSummary } from "./card-summary";

const estimate = {
  videos: [{ id: "video-a" }, { id: "video-b" }, { id: "missing-uid" }],
  authors: [{ uid: "author-a" }], recommendedViews: 123456,
  result: { totalCents: 10005 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue({ id: "activity", settlement: null });
  mocks.activityInput.mockReturnValue({ title: "当前规则" });
  mocks.estimate.mockResolvedValue(estimate);
});

describe("专题活动卡片统计", () => {
  it("与详情页使用同一预估结果，统计全部匹配稿件和去重达人数，金额使用分", async () => {
    expect(await activityCardSummary("activity", 1, null)).toEqual({ videoCount: 3, authorCount: 1, recommendedViews: 123456, totalCents: 10005 });
    expect(mocks.estimate).toHaveBeenCalledWith({ title: "当前规则" });
  });

  it("已结算活动读取冻结快照，不随最新数据重新计算", async () => {
    mocks.findUnique.mockResolvedValue({ id: "activity", settlement: { version: 1, estimate } });
    mocks.estimate.mockResolvedValue({ ...estimate, recommendedViews: 999999, result: { totalCents: 99999 } });
    expect(await activityCardSummary("activity", 1, "2026-08-01T00:00:00Z")).toEqual({ videoCount: 3, authorCount: 1, recommendedViews: 123456, totalCents: 10005 });
    expect(mocks.activityInput).not.toHaveBeenCalled();
    expect(mocks.estimate).not.toHaveBeenCalled();
  });

  it("无稿件时返回真实零值，计算失败与活动不存在均保留为错误", async () => {
    mocks.estimate.mockResolvedValue({ videos: [], authors: [], recommendedViews: 0, result: { totalCents: 0 } });
    expect(await activityCardSummary("activity", 1, null)).toEqual({ videoCount: 0, authorCount: 0, recommendedViews: 0, totalCents: 0 });
    mocks.estimate.mockRejectedValueOnce(new Error("计算失败"));
    await expect(activityCardSummary("activity", 1, null)).rejects.toThrow("计算失败");
    mocks.findUnique.mockResolvedValueOnce(null);
    await expect(activityCardSummary("missing", 1, null)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
