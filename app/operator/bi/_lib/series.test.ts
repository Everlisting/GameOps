import { describe, expect, it } from "vitest";
import { biRange, buildBiTrend } from "./series";
import { percent, percentageText, reviewHref } from "./format";

const now = new Date("2026-11-18T07:00:00Z");
describe("BI 北京时间范围", () => {
  it("默认截止昨天的 30 天，查询边界包含止日全天", () => {
    const range = biRange({}, now);
    expect(range.from).toBe("2026-10-19");
    expect(range.to).toBe("2026-11-17");
    expect(range.publishedAt.gte?.toISOString()).toBe(
      "2026-10-18T16:00:00.000Z",
    );
    expect(range.publishedAt.lt?.toISOString()).toBe(
      "2026-11-17T16:00:00.000Z",
    );
  });
  it("跨北京时间零点而非 UTC 零点推进昨天", () => {
    expect(biRange({}, new Date("2026-11-17T15:59:59Z")).to).toBe("2026-11-16");
    expect(biRange({}, new Date("2026-11-17T16:00:00Z")).to).toBe("2026-11-17");
  });
  it("没有显式止日时展示最近有数据的30天，显式选择不自动跳转", () => {
    const range = biRange({}, now, "2026-07-21");
    expect(range.from).toBe("2026-06-22");
    expect(range.to).toBe("2026-07-21");
    expect(biRange({ trendTo: "2026-11-01" }, now, "2026-07-21").to).toBe(
      "2026-11-01",
    );
    expect(biRange({}, now, "2027-01-01").to).toBe("2026-11-17");
  });
  it("非法日历日期不能溢出，未来日期不能引入未完成日", () => {
    expect(
      biRange({ trendFrom: "2026-02-30", trendTo: "2026-11-31" }, now).from,
    ).toBe("2026-10-19");
    expect(biRange({ trendTo: "2028-01-01" }, now).to).toBe("2026-11-17");
  });
  it("反向区间回退到止日前 30 天，超大区间最多 366 天", () => {
    expect(
      biRange({ trendFrom: "2026-08-01", trendTo: "2026-07-31" }, now).from,
    ).toBe("2026-07-02");
    const range = biRange(
      { trendFrom: "2000-01-01", trendTo: "2026-07-31" },
      now,
    );
    expect(buildBiTrend(range, [], [])).toHaveLength(366);
  });
  it("合法单日及闰日不改变范围", () => {
    const range = biRange(
      { trendFrom: "2024-02-29", trendTo: "2024-02-29" },
      now,
    );
    expect(buildBiTrend(range, [], []).map((d) => d.date)).toEqual([
      "2024-02-29",
    ]);
  });
  it("拒绝数据库不支持的公元零年，范围不早于 2000 年", () => {
    expect(biRange({ trendTo: "0000-01-01" }, now).to).toBe("2026-11-17");
    expect(
      biRange({ trendFrom: "0000-01-01", trendTo: "2000-01-01" }, now).from,
    ).toBe("2000-01-01");
  });
});
describe("BI 快照缺失与真实零值", () => {
  const range = { from: "2026-07-01", to: "2026-07-03" };
  it("无快照的日期留空，同时补齐发布零值", () => {
    const result = buildBiTrend(range, [], [{ date: "2026-07-02", works: 12 }]);
    expect(result.map((d) => d.viewsChange)).toEqual([null, null, null]);
    expect(result.map((d) => d.works)).toEqual([0, 12, 0]);
  });
  it("当日有快照但没有同视频相邻日对照时不显示零增长", () => {
    const result = buildBiTrend(
      range,
      [
        {
          day: new Date("2026-07-01"),
          recorded: 100,
          matched: 0,
          change: null,
        },
      ],
      [],
    );
    expect(result[0]).toMatchObject({
      recorded: 100,
      matched: 0,
      viewsChange: null,
    });
  });
  it("真实零变化和负向数据回调均保留", () => {
    const result = buildBiTrend(
      range,
      [
        { day: new Date("2026-07-01"), recorded: 100, matched: 80, change: 0n },
        {
          day: new Date("2026-07-02"),
          recorded: 100,
          matched: 90,
          change: -25n,
        },
        {
          day: new Date("2026-07-03"),
          recorded: 100,
          matched: 100,
          change: 250n,
        },
      ],
      [],
    );
    expect(result.map((d) => d.viewsChange)).toEqual([0, -25, 250]);
    expect(result[0].matched).toBe(80);
  });
});
describe("BI 比例和下钻口径", () => {
  it("非空极小比例不误显示为 0%，未完成不四舍五入为 100%", () => {
    expect(percentageText(14, 53496)).toBe("<0.1%");
    expect(percent(99999, 100000)).toBe(99.9);
    expect(percent(0, 0)).toBe(0);
    expect(percent(100, 100)).toBe(100);
  });
  it("审核入口保留日期与状态，跨菜单导航不清理筛选", () => {
    const query = new URL(
      reviewHref({ from: "2026-07-01", to: "2026-07-31" }, "REJECTED"),
      "http://localhost",
    ).searchParams;
    expect(Object.fromEntries(query)).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
      status: "REJECTED",
      keepFilters: "1",
    });
  });
});
