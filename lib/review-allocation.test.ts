import { describe, expect, it } from "vitest";
import { allocateReviewVideos, combinedAllocationCounts, equalAllocationCounts } from "./review-allocation";
import { reviewAssignmentSchema } from "./validation/review-assignment";
function random(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; }; }
const videos = Array.from({ length: 37 }, (_, index) => ({ id: `v${index}`, platform: "douyin", creatorUid: `author${Math.floor(index / 6)}` }));
describe("稿件随机分配", () => {
  it("平均分配覆盖全部稿件且每条只分配一次，各人最多相差1条", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const targets = equalAllocationCounts(videos.length, ["r1", "r2", "r3"], random(seed));
      const plan = allocateReviewVideos(videos, targets, random(seed + 100));
      expect(plan).toHaveLength(videos.length);
      expect(new Set(plan.map((row) => row.videoId)).size).toBe(videos.length);
      const counts = targets.map((target) => plan.filter((row) => row.reviewerId === target.reviewerId).length);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      for (const target of targets) expect(plan.filter((row) => row.reviewerId === target.reviewerId)).toHaveLength(target.count);
      for (const uid of ["author0", "author1", "author2", "author3", "author4", "author5"])
        expect(new Set(plan.filter((row) => videos.find((v) => v.id === row.videoId)?.creatorUid === uid).map((row) => row.reviewerId)).size).toBeGreaterThan(1);
    }
  });
  it("指定量严格匹配，不按发布时间只截取开头，剩余保持未分配", () => {
    const targets = [{ reviewerId: "r1", count: 3 }, { reviewerId: "r2", count: 2 }];
    const plans = Array.from({ length: 10 }, (_, index) => allocateReviewVideos(videos, targets, random(index + 1)));
    for (const plan of plans) {
      expect(plan).toHaveLength(5);
      expect(plan.filter((row) => row.reviewerId === "r1")).toHaveLength(3);
      expect(plan.filter((row) => row.reviewerId === "r2")).toHaveLength(2);
    }
    expect(new Set(plans.map((plan) => plan.map((row) => row.videoId).join(","))).size).toBeGreaterThan(1);
  });
  it("单个作者可分散给多位审核员，未知作者不合并为一个人", () => {
    const allSame = videos.map((row) => ({ ...row, creatorUid: "same" }));
    const plan = allocateReviewVideos(allSame, equalAllocationCounts(37, ["a", "b", "c"], random(1)), random(2));
    expect(new Set(plan.map((row) => row.reviewerId)).size).toBe(3);
    expect(allocateReviewVideos(videos.map((row) => ({ ...row, creatorUid: null })), [{ reviewerId: "a", count: 2 }], random(3))).toHaveLength(2);
  });
  it("平均分配可只取指定总量，组合组内平均、跨组同人汇总且稿件不重复", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const targets = combinedAllocationCounts([
        { mode: "EVEN", totalCount: 7, recipients: [{ reviewerId: "a" }, { reviewerId: "b" }] },
        { mode: "QUOTA", recipients: [{ reviewerId: "a", count: 2 }, { reviewerId: "c", count: 3 }] },
      ], videos.length, random(seed));
      const counts = Object.fromEntries(targets.map((row) => [row.reviewerId, row.count]));
      expect(counts.a).toBeGreaterThanOrEqual(5); expect(counts.a).toBeLessThanOrEqual(6);
      expect(Math.abs((counts.a - 2) - counts.b)).toBe(1); expect(counts.c).toBe(3);
      const plan = allocateReviewVideos(videos, targets, random(seed + 100));
      expect(plan).toHaveLength(12); expect(new Set(plan.map((row) => row.videoId)).size).toBe(12);
      for (const target of targets) expect(plan.filter((row) => row.reviewerId === target.reviewerId)).toHaveLength(target.count);
    }
  });
  it("多个平均组和少于人数的总量都守住每组数量，余量随机给人", () => {
    const targets = combinedAllocationCounts([
      { mode: "EVEN", totalCount: 1, recipients: [{ reviewerId: "a" }, { reviewerId: "b" }, { reviewerId: "c" }] },
      { mode: "EVEN", totalCount: 6, recipients: [{ reviewerId: "a" }, { reviewerId: "b" }] },
    ], videos.length, random(1));
    expect(targets.reduce((sum, row) => sum + row.count, 0)).toBe(7);
    expect(allocateReviewVideos(videos, targets, random(2))).toHaveLength(7);
  });
  it("组合校验要求平均总量且限制合计，组内不重人，跨组可重人；坏组合不得回退成旧全部分配", () => {
    const base = { requestId: "1d9ca818-d264-4d5a-8467-728f68f1712e", expectedEligibleCount: 37 };
    const group = { mode: "EVEN", totalCount: 5, recipients: [{ reviewerId: "a" }] };
    expect(reviewAssignmentSchema.safeParse({ ...base, groups: [group, group] }).success).toBe(true);
    for (const invalid of [
      { ...group, totalCount: 0 }, { ...group, totalCount: -1 }, { ...group, totalCount: 1.5 },
      { ...group, totalCount: undefined }, { ...group, totalCount: 38 }, { ...group, recipients: [] },
      { ...group, recipients: [{ reviewerId: "a" }, { reviewerId: "a" }] },
    ]) expect(reviewAssignmentSchema.safeParse({ ...base, groups: [invalid] }).success).toBe(false);
    expect(reviewAssignmentSchema.safeParse({ ...base, groups: [{ ...group, totalCount: 20 }, { ...group, totalCount: 20 }] }).success).toBe(false);
    expect(reviewAssignmentSchema.safeParse({ ...base, groups: [{ ...group, totalCount: 100 }], mode: "EVEN", recipients: [{ reviewerId: "a" }] }).success).toBe(false);
    expect(reviewAssignmentSchema.safeParse({ ...base, groups: Array(21).fill({ ...group, totalCount: 1 }) }).success).toBe(false);
  });
  it("拒绝超量、重复审核员和小数，API要求请求标识及指定量", () => {
    expect(() => allocateReviewVideos(videos, [{ reviewerId: "a", count: 100 }])).toThrow();
    expect(() => allocateReviewVideos(videos, [{ reviewerId: "a", count: 1.5 }])).toThrow();
    expect(() => allocateReviewVideos(videos, [{ reviewerId: "a", count: 1 }, { reviewerId: "a", count: 1 }])).toThrow();
    const base = { requestId: "1d9ca818-d264-4d5a-8467-728f68f1712e", expectedEligibleCount: 37, mode: "QUOTA", recipients: [{ reviewerId: "a", count: 0 }] };
    expect(reviewAssignmentSchema.safeParse(base).success).toBe(false);
    expect(reviewAssignmentSchema.safeParse({ ...base, mode: "EVEN" }).success).toBe(true);
    expect(reviewAssignmentSchema.safeParse({ ...base, requestId: "" }).success).toBe(false);
  });
});
