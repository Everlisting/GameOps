import { describe, expect, it } from "vitest";
import { authorKey, calculateRewards, type ActivityVideo } from "./engine";
import { specialActivitySchema, type RewardPool, type SpecialActivityInput } from "./rules";

function video(id: string, recommendedViews: number, uid = "a"): ActivityVideo {
  return {
    id, title: `率土之滨 ${id}`, url: "https://example.com", platform: "douyin", creatorUid: uid, creatorName: uid,
    publishedAt: "2026-07-01T02:00:00Z", dataAt: "2026-08-03T12:00:00Z", datasetId: "data",
    recommendedViews, views: recommendedViews, likes: 0, comments: 0, shares: 0, fansGained: 0,
  };
}

const main: RewardPool = { name: "激流勇进", exclusiveGroup: "主奖池", steps: [
  { kind: "FILTER", match: "ALL", conditions: [{ field: "recommendedViews", op: "gte", value: 1000 }] },
  { kind: "GROUP" },
  { kind: "FILTER", match: "ANY", conditions: [{ field: "count", op: "gte", value: 10 }, { field: "maxRecommendedViews", op: "gte", value: 100000 }] },
  { kind: "TIER", metric: "recommendedViews", tiers: [{ min: 50000, amount: 600 }, { min: 100000, amount: 1000 }, { min: 150000, amount: 1500 }] },
] };
const starter: RewardPool = { name: "初出茅庐", exclusiveGroup: "主奖池", steps: [
  { kind: "TIER", metric: "recommendedViews", tiers: [{ min: 500, amount: 5 }, { min: 700, amount: 10 }, { min: 1000, amount: 15 }] },
  { kind: "FILTER", match: "ALL", conditions: [{ field: "reward", op: "gt", value: 0 }] },
  { kind: "LIMIT", metric: "reward", count: 90, scope: "AUTHOR" }, { kind: "GROUP" }, { kind: "CAP", amount: 450 },
] };

const input: SpecialActivityInput = {
  title: "组合规则验证", description: "", startDate: "2026-07-01", endDate: "2026-07-31",
  filters: { rules: [{ kind: "TITLE", values: ["率土之滨"], match: "ALL" }], match: "ALL" }, settlementMode: "CONFIRMATION", cutoffAt: null,
  pools: [main, starter],
};

describe("专题活动规则组合", () => {
  it("爆款豁免放开达人条数门槛，其他合格稿件共同累计，互斥组保留高优先级正金额", () => {
    const videos = [video("one", 120000), video("two", 20000), video("three", 10000), video("low", 999)];
    const result = calculateRewards(videos, specialActivitySchema.parse(input).pools);
    expect(result.totalCents).toBe(150000);
    expect(result.pools[0].recipients[0].videoIds).toEqual(["one", "two", "three"]);
    expect(result.pools[0].excluded.low).toContain("按条件筛选");
    expect(result.pools[1].recipients[0]).toMatchObject({ suppressed: true, paidCents: 0, calculatedCents: 5500 });
  });

  it("高优先级未命中奖励时允许低优先级计奖，空互斥组独立叠加", () => {
    const videos = Array.from({ length: 10 }, (_, i) => video(String(i), 1000));
    const extra: RewardPool = { name: "额外奖", exclusiveGroup: "", steps: [{ kind: "GROUP" }, { kind: "FIXED", amount: 2.25 }] };
    const result = calculateRewards(videos, [main, starter, extra]);
    expect(result.authorTotals[authorKey(videos[0])!]).toBe(15225);
    expect(result.pools[0].recipients[0].paidCents).toBe(0);
  });

  it("互斥按相同组名和奖池顺序逐达人判断，优先级高于金额大小", () => {
    const videos = [video("one", 1000)];
    const lowerAmount: RewardPool = { name: "低额奖", exclusiveGroup: "基础奖励", steps: [{ kind: "FIXED", amount: 10 }] };
    const higherAmount: RewardPool = { name: "高额奖", exclusiveGroup: "基础奖励", steps: [{ kind: "FIXED", amount: 100 }] };
    const forward = calculateRewards(videos, [lowerAmount, higherAmount]);
    const backward = calculateRewards(videos, [higherAmount, lowerAmount]);
    expect(forward.totalCents).toBe(1000);
    expect(forward.pools[1].recipients[0].suppressed).toBe(true);
    expect(backward.totalCents).toBe(10000);
    // 单方面填写另一个奖池的名字，不会自动把两者加入同一个组。
    const separate = calculateRewards(videos, [lowerAmount, { ...higherAmount, exclusiveGroup: lowerAmount.name }]);
    expect(separate.totalCents).toBe(11000);
  });

  it("单稿档位含等号，排序限量按达人分别执行，汇总后封顶", () => {
    const a = Array.from({ length: 91 }, (_, i) => video(`a-${i}`, 1000));
    const result = calculateRewards([...a, video("b-1", 500, "b"), video("b-2", 700, "b"), video("b-3", 499, "b")], [starter]);
    expect(result.pools[0].recipients.map((row) => [row.videoIds.length, row.paidCents])).toEqual([[90, 45000], [2, 1500]]);
    expect(Object.keys(result.pools[0].excluded)).toHaveLength(2);
  });

  it("金额按分计算，缺少指标或 UID 的视频只留异常说明", () => {
    const valid = video("valid", 333);
    const pool: RewardPool = { name: "比例", exclusiveGroup: "", steps: [{ kind: "RATE", metric: "recommendedViews", unit: 1000, amount: 5 }] };
    const result = calculateRewards([valid, { ...video("missing", 100000), dataAt: null }, { ...video("unknown", 100000), creatorUid: null }], [pool]);
    expect(result.totalCents).toBe(167);
    expect(result.pools[0].excluded).toEqual({ missing: "缺少可用指标", unknown: "缺少达人 UID" });
  });

  it("按达人累计后取前十，按含首尾的名次区间发放不同金额", () => {
    const videos = Array.from({ length: 11 }, (_, i) => video(`v-${i}`, 100 - i * 5, `uid-${i}`));
    // 同一达人有多条视频，先汇总才能正确进入第一名。
    videos.push(video("bonus-video", 25, "uid-1"));
    const pools: RewardPool[] = [{ name: "排名奖", exclusiveGroup: "", steps: [
      { kind: "GROUP" },
      { kind: "LIMIT", metric: "recommendedViews", scope: "POOL", count: 10 },
      { kind: "RANK", metric: "recommendedViews", ranges: [
        { from: 1, to: 1, amount: 1000 }, { from: 2, to: 3, amount: 500 },
        { from: 4, to: 6, amount: 300 }, { from: 7, to: 10, amount: 100 },
      ] },
    ] }];
    const result = calculateRewards(videos.reverse(), specialActivitySchema.parse({ ...input, pools }).pools);
    expect(result.totalCents).toBe(330000);
    expect(result.pools[0].recipients.map((row) => row.paidCents)).toEqual([
      100000, 50000, 50000, 30000, 30000, 30000, 10000, 10000, 10000, 10000,
    ]);
    expect(result.pools[0].recipients[0]).toMatchObject({ author: '["douyin","uid-1"]', videoIds: ["bonus-video", "v-1"] });
    expect(result.pools[0].recipients[0].notes[0]).toContain("第 1 名");
    expect(result.pools[0].excluded["v-10"]).toContain("超出");
  });

  it("名次并列时按固定键决胜，区间外仍可参加后续步骤", () => {
    const a = video("a", 1000, "uid-a");
    const b = video("b", 1000, "uid-b");
    const pool: RewardPool = { name: "第一名加奖", exclusiveGroup: "", steps: [
      { kind: "GROUP" }, { kind: "RANK", metric: "recommendedViews", ranges: [{ from: 1, to: 1, amount: 100 }] },
      { kind: "FIXED", amount: 5 },
    ] };
    for (const videos of [[a, b], [b, a]]) {
      const result = calculateRewards(videos, [pool]);
      expect(result.authorTotals[authorKey(a)!]).toBe(10500);
      expect(result.authorTotals[authorKey(b)!]).toBe(500);
    }
  });

  it.each([
    [[{ from: 4, to: 6, amount: 300 }, { from: 1, to: 4, amount: 500 }], "名次区间不能重叠"],
    [[{ from: 4, to: 3, amount: 300 }], "结束名次必须不小于开始名次"],
  ] as const)("拒绝无效的奖励名次区间 %j", (ranges, message) => {
    const result = specialActivitySchema.safeParse({ ...input, pools: [
      { name: "排名奖", exclusiveGroup: "", steps: [{ kind: "RANK", metric: "views", ranges }] },
    ] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.message).join()).toContain(message);
  });

  it("拒绝尚未汇总就使用稿件数、重复档位、无计奖步骤和活动结束前的截止时间", () => {
    const result = specialActivitySchema.safeParse({ ...input, settlementMode: "CUTOFF", cutoffAt: "2026-07-31T15:00", pools: [
      { name: "顺序错误", exclusiveGroup: "", steps: [{ kind: "FILTER", match: "ALL", conditions: [{ field: "count", op: "gte", value: 10 }] }] },
      { name: "重复档位", exclusiveGroup: "", steps: [{ kind: "TIER", metric: "views", tiers: [{ min: 1000, amount: 1 }, { min: 1000, amount: 2 }] }] },
    ] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toHaveLength(4);
  });
});
