import { describe, expect, it } from "vitest";
import { authorKey, calculateRewards, type ActivityVideo } from "./engine";
import { matchesAuthor, settlementAuthors } from "./author-details";
import type { RewardPool } from "./rules";

function video(id: string, recommendedViews: number): ActivityVideo {
  return {
    id, reviewStatus: "APPROVED", title: `稿件 ${id}`, platform: "douyin", url: `https://www.douyin.com/video/${id}`,
    creatorUid: "uid-123", creatorName: "率土作者", creatorAccount: "Douyin_Account",
    recommendedViews, views: recommendedViews, likes: 0, comments: 0, shares: 0, fansGained: 0,
    publishedAt: "2026-07-01T00:00:00Z", dataAt: "2026-08-01T00:00:00Z", datasetId: "snapshot",
  };
}

describe("结算达人明细", () => {
  it("跨奖池去重计奖稿件和播放量，排除互斥未计奖的稿件", () => {
    const videos = [video("1", 1000), video("2", 2000), video("3", 4000)];
    const pools: RewardPool[] = [
      { name: "主奖池", exclusiveGroup: "基础", steps: [
        { kind: "FILTER", match: "ALL", conditions: [{ field: "recommendedViews", op: "lte", value: 2000 }] },
        { kind: "GROUP" }, { kind: "FIXED", amount: 10 },
      ] },
      { name: "额外奖", exclusiveGroup: "", steps: [
        { kind: "FILTER", match: "ALL", conditions: [{ field: "recommendedViews", op: "eq", value: 1000 }] },
        { kind: "FIXED", amount: 20 },
      ] },
      { name: "被互斥奖池", exclusiveGroup: "基础", steps: [
        { kind: "FILTER", match: "ALL", conditions: [{ field: "recommendedViews", op: "gte", value: 4000 }] },
        { kind: "FIXED", amount: 30 },
      ] },
    ];
    const authors = [{ key: authorKey(videos[0])!, name: "率土作者", uid: "uid-123", platform: "douyin", count: 3 }];
    const details = settlementAuthors({ videos, authors, result: calculateRewards(videos, pools) });
    expect(details[0]).toMatchObject({ count: 3, account: "Douyin_Account", matchedCount: 2, matchedViews: 3000 });
    expect(matchesAuthor(details[0], "UID-123")).toBe(true);
    expect(matchesAuthor(details[0], "douyin_account")).toBe(true);
    expect(matchesAuthor(details[0], "率土")).toBe(true);
    expect(matchesAuthor(details[0], "不存在")).toBe(false);
  });

  it("未获奖达人显示零命中，兼容未记录抖音号的历史快照", () => {
    const oldVideo = video("old", 1000);
    delete oldVideo.creatorAccount;
    const authors = [{ key: authorKey(oldVideo)!, name: "率土作者", uid: "uid-123", platform: "douyin", count: 1 }];
    const result = calculateRewards([oldVideo], [{ name: "零元奖", exclusiveGroup: "", steps: [{ kind: "FIXED", amount: 0 }] }]);
    const details = settlementAuthors({ videos: [oldVideo], authors, result });
    expect(details[0]).toMatchObject({ account: null, matchedCount: 0, matchedViews: 0 });
    expect(matchesAuthor(details[0], "")).toBe(true);
  });
});
