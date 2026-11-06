import { describe, expect, it } from "vitest";
import { buildAnchorQuery } from "./query";

const NOW = new Date("2026-11-05T09:00:00Z");
const dates = (values: unknown[]) => values.filter((value): value is Date => value instanceof Date).map((date) => date.toISOString());

describe("主播名单与统计窗口", () => {
  it("入会日期只筛名单,视频和直播仍统计本月1日至当天", () => {
    const query = buildAnchorQuery({ joinedFrom: "2025-02-01", joinedTo: "2025-02-28" }, NOW);
    expect(query.rosterWhere.text).toContain('a."joinedAt"');
    expect(dates(query.rosterWhere.values)).toEqual(["2025-01-31T16:00:00.000Z", "2025-02-28T16:00:00.000Z"]);
    expect(dates(query.aggJoin.values)).toEqual(["2026-10-31T16:00:00.000Z", "2026-11-05T16:00:00.000Z"]);
    // @db.Date 的日历值,与视频 DateTime 的 UTC+8 边界分开处理。
    expect(dates(query.liveAggJoin.values)).toEqual(["2026-11-01T00:00:00.000Z", "2026-11-06T00:00:00.000Z"]);
    expect(query.periodFrom).toBe("2026-11-01");
    expect(query.periodTo).toBe("2026-11-05");
  });

  it("无入会筛选时保留完整名单,跨平台相同UID不会混入作品或直播", () => {
    const query = buildAnchorQuery(undefined, NOW);
    expect(query.rosterWhere.text).toBe("TRUE");
    expect(query.aggJoin.text).toContain('vs.platform = a."platform"');
    expect(query.liveAggJoin.text).toContain('ls.platform = a."platform"');
    expect(query.aggJoin.text).toContain('v."hidden" = false');
  });

  it("保留数据工具的历史统计窗口,拒绝无效入会日期", () => {
    const query = buildAnchorQuery({ joinedFrom: "2026-02-30", publishedFrom: "2026-07-01", publishedTo: "2026-07-31" }, NOW);
    expect(query.joinedFrom).toBe("");
    expect(query.defaultMonth).toBeNull();
    expect(dates(query.aggJoin.values)).toEqual(["2026-06-30T16:00:00.000Z", "2026-07-31T16:00:00.000Z"]);
  });
});
