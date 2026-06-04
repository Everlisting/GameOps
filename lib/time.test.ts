import { describe, it, expect } from "vitest";
import { chinaDateStart, chinaDateString } from "./time";

describe("chinaDateStart", () => {
  it("UTC 早些时刻仍属北京时间同一天", () => {
    const d = chinaDateStart(new Date("2026-06-01T03:00:00Z"));
    // 北京 11:00 当天 → 北京日期 6/1 → UTC midnight 2026-06-01
    expect(d.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("跨日(UTC 23:00 = 北京次日 07:00)", () => {
    const d = chinaDateStart(new Date("2026-06-01T23:00:00Z"));
    expect(d.toISOString()).toBe("2026-06-02T00:00:00.000Z");
  });

  it("UTC 16:00 边界 = 北京 00:00,算次日", () => {
    const d = chinaDateStart(new Date("2026-06-01T16:00:00Z"));
    expect(d.toISOString()).toBe("2026-06-02T00:00:00.000Z");
  });
});

describe("chinaDateString", () => {
  it("YYYY-MM-DD 格式", () => {
    expect(chinaDateString(new Date("2026-06-01T03:00:00Z"))).toBe("2026-06-01");
    expect(chinaDateString(new Date("2026-06-01T16:30:00Z"))).toBe("2026-06-02");
  });

  it("月/日补零", () => {
    expect(chinaDateString(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });
});
