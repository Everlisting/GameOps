import { describe, expect, it } from "vitest";
import type { ActivityVideo } from "./engine";
import { activityVideoDetails, platformVideoId } from "./video-details";

function video(id: string, recommendedViews = 0): ActivityVideo {
  return {
    id, externalId: `766404297003952${id}`, title: "稿件标题", url: `https://www.douyin.com/video/766404297003952${id}`,
    platform: "douyin", creatorUid: "4214851805965760", creatorName: "率土作者", creatorAccount: "Douyin_Account",
    publishedAt: "2026-07-01T00:00:00Z", dataAt: "2026-08-01T00:00:00Z", datasetId: null,
    recommendedViews, views: recommendedViews, likes: 0, comments: 0, shares: 0, fansGained: 0,
  };
}

describe("活动稿件明细", () => {
  it("按作品 ID、达人 UID 或抖音号检索，保留长 ID 精度并忽略空白与大小写", () => {
    const source = video("2982");
    for (const query of ["7664042970039522982", "4214851805965760", "  DOUYIN_account  "]) {
      expect(activityVideoDetails([source], query)).toEqual([source]);
    }
    for (const query of ["不存在", "稿件标题", "率土作者", "2982-missing"]) {
      expect(activityVideoDetails([source], query)).toEqual([]);
    }
  });

  it("兼容缺失身份与平台 ID 的历史快照，不将内部记录 ID 当作作品 ID", () => {
    const old = video("2982");
    delete old.externalId;
    delete old.creatorAccount;
    old.creatorUid = null;
    expect(platformVideoId(old)).toBe("7664042970039522982");
    expect(activityVideoDetails([old], "7664042970039522982")).toEqual([old]);
    expect(activityVideoDetails([old], "douyin_account")).toEqual([]);
    old.url = "https://v.douyin.com/unknown/";
    expect(platformVideoId(old)).toBeNull();
    expect(activityVideoDetails([old], old.id)).toEqual([]);
    expect(activityVideoDetails([old], "")).toEqual([old]);
  });

  it("对所有匹配稿件按推荐播放量降序排列，分页前完成排序且不修改原快照", () => {
    const source = Array.from({ length: 65 }, (_, index) => video(String(index).padStart(4, "0"), index * 100));
    const originalIds = source.map((item) => item.id);
    const result = activityVideoDetails(source, "douyin_account");
    expect(result).toHaveLength(65);
    expect(result.slice(0, 30).map((item) => item.recommendedViews)).toEqual(Array.from({ length: 30 }, (_, index) => (64 - index) * 100));
    expect(result[30].recommendedViews).toBe(3400);
    expect(source.map((item) => item.id)).toEqual(originalIds);
    expect(activityVideoDetails([video("2", 100), video("1", 100)], "").map((item) => item.id)).toEqual(["1", "2"]);
  });
});
