import { describe, expect, it } from "vitest";
import { buildVideoQuery } from "./query";

const NOW = new Date("2026-11-05T09:00:00Z");

describe("达人视频精确筛选", () => {
  it("表格、统计及导出共用精确平台和UID,不会因同名或UID前缀串人", () => {
    const query = buildVideoQuery({ creatorUid: "123", platform: "douyin", q: "同名达人", status: "all" }, NOW);
    expect(query.tableWhere.creatorUid).toBe("123");
    expect(query.tableWhere.platform).toBe("douyin");
    expect(query.statsWhere.creatorUid).toBe("123");
    expect(query.statsWhere.platform).toBe("douyin");
    expect(query.tableWhere.hidden).toBeUndefined();
    expect(query.statsWhere.hidden).toBe(false);
    expect(query.tableWhere.publishedAt).toEqual({
      gte: new Date("2026-10-31T16:00:00Z"), lt: new Date("2026-11-05T16:00:00Z"),
    });
  });

  it("跳转指定本月发布日期后,继续筛选和导出保持相同窗口", () => {
    const query = buildVideoQuery({ creatorUid: "123", platform: "douyin", publishedFrom: "2026-11-01", publishedTo: "2026-11-05" }, NOW);
    expect(query.defaultMonth).toBeNull();
    expect(query.tableWhere).toEqual(query.statsWhere);
    expect(query.tableWhere.publishedAt).toEqual({
      gte: new Date("2026-10-31T16:00:00Z"), lt: new Date("2026-11-05T16:00:00Z"),
    });
  });

  it("清除达人条件后恢复所有达人,发布日期筛选仍可查往月", () => {
    const query = buildVideoQuery({ publishedFrom: "2026-07-01", publishedTo: "2026-07-31" }, NOW);
    expect(query.tableWhere.creatorUid).toBeUndefined();
    expect(query.tableWhere.platform).toBeUndefined();
    expect(query.tableWhere.publishedAt).toEqual({
      gte: new Date("2026-06-30T16:00:00Z"), lt: new Date("2026-07-31T16:00:00Z"),
    });
  });
});
