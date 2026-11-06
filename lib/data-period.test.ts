import { describe, expect, it } from "vitest";
import { chinaDateTimeRange, creatorMonthVideosHref, dateValue, monthToDate } from "./data-period";

describe("业务日期范围", () => {
  it("以北京时间跨月,止日是当天而非月底", () => {
    expect(monthToDate(new Date("2026-10-31T16:01:00Z"))).toEqual({ from: "2026-11-01", to: "2026-11-01" });
    expect(monthToDate(new Date("2026-11-05T09:00:00Z"))).toEqual({ from: "2026-11-01", to: "2026-11-05" });
  });

  it("起止包含整日,UTC 部署也不丢北京时间凌晨数据", () => {
    const range = chinaDateTimeRange("2026-11-01", "2026-11-05");
    expect(range.gte?.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(range.lt?.toISOString()).toBe("2026-11-05T16:00:00.000Z");
  });

  it("支持单边范围与跨年、闰日", () => {
    expect(chinaDateTimeRange("", "2026-12-31").gte).toBeUndefined();
    expect(chinaDateTimeRange("", "2026-12-31").lt?.toISOString()).toBe("2026-12-31T16:00:00.000Z");
    expect(dateValue("2024-02-29")).toBe("2024-02-29");
    expect(dateValue("2026-02-29")).toBe("");
    expect(dateValue("2026-11-31")).toBe("");
    expect(dateValue("not-a-date")).toBe("");
  });

  it("达人跳转只携带精确身份和当月发布日期,安全编码参数", () => {
    const url = new URL(creatorMonthVideosHref("douyin", "123&456", "2026-11-01", "2026-11-05"), "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      platform: "douyin", creatorUid: "123&456", publishedFrom: "2026-11-01", publishedTo: "2026-11-05", keepFilters: "1",
    });
    expect(url.pathname).toBe("/operator/data/videos");
  });
});
