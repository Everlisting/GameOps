import { describe, it, expect } from "vitest";
import { _testing } from "./anchor-roster";

const { normalizePlatform, normalizeUid, parseFlexibleDate, parseIntSafe } = _testing;

describe("normalizePlatform", () => {
  it("空值缺省 douyin", () => {
    expect(normalizePlatform("")).toBe("douyin");
  });
  it("中文「抖音」归一到 douyin", () => {
    expect(normalizePlatform("抖音")).toBe("douyin");
  });
  it("英文大小写归一", () => {
    expect(normalizePlatform("Douyin")).toBe("douyin");
  });
  it("快手 / 视频号 各自归一", () => {
    expect(normalizePlatform("快手")).toBe("kuaishou");
    expect(normalizePlatform("视频号")).toBe("wechat_channels");
  });
  it("未知平台透传(小写)", () => {
    expect(normalizePlatform("XiaoHongShu")).toBe("xiaohongshu");
  });
});

describe("normalizeUid", () => {
  it("纯数字原样返回", () => {
    expect(normalizeUid("4214851805965760")).toBe("4214851805965760");
  });
  it("科学计数法 1.00449E+11 还原", () => {
    expect(normalizeUid("1.00449E+11")).toBe("100449000000");
  });
  it("空串返 null", () => {
    expect(normalizeUid("")).toBeNull();
  });
});

describe("parseFlexibleDate", () => {
  it("纯日期(短横线)", () => {
    const d = parseFlexibleDate("2026-06-01");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(5);
    expect(d?.getDate()).toBe(1);
  });
  it("纯日期(斜杠、不补零)", () => {
    const d = parseFlexibleDate("2026/6/1");
    expect(d?.getMonth()).toBe(5);
    expect(d?.getDate()).toBe(1);
  });
  it("日期+时间", () => {
    const d = parseFlexibleDate("2026-06-01 12:30:00");
    expect(d?.getHours()).toBe(12);
    expect(d?.getMinutes()).toBe(30);
  });
  it("空 / 非法返回 null", () => {
    expect(parseFlexibleDate("")).toBeNull();
    expect(parseFlexibleDate("六月一日")).toBeNull();
  });
});

describe("parseIntSafe", () => {
  it("千分位逗号容忍", () => {
    expect(parseIntSafe("1,234,567")).toBe(1234567);
  });
  it("空 / 非数字返回 0", () => {
    expect(parseIntSafe("")).toBe(0);
    expect(parseIntSafe("N/A")).toBe(0);
  });
});
