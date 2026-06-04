import { describe, it, expect } from "vitest";
import { _testing } from "./douyin-video-detail";

const { parseVideoId, normalizeUid, parseChineseDate, parseIntSafe } = _testing;

describe("parseVideoId", () => {
  it("命中标准 douyin 视频 URL", () => {
    expect(parseVideoId("https://www.douyin.com/video/7634896905164011707")).toBe(
      "7634896905164011707",
    );
  });
  it("URL 带后缀参数也能取到", () => {
    expect(
      parseVideoId("https://www.douyin.com/video/7634896905164011707?utm=x"),
    ).toBe("7634896905164011707");
  });
  it("非视频链接返回 null", () => {
    expect(parseVideoId("https://www.douyin.com/user/abc")).toBeNull();
  });
});

describe("normalizeUid", () => {
  it("纯数字原样返回", () => {
    expect(normalizeUid("1003214724689710")).toBe("1003214724689710");
  });
  it("科学计数法 1.00449E+11 还原成 100449000000", () => {
    expect(normalizeUid("1.00449E+11")).toBe("100449000000");
  });
  it("科学计数法小写 e 也认", () => {
    expect(normalizeUid("3.14e+5")).toBe("314000");
  });
  it("整数无小数 1E+11", () => {
    expect(normalizeUid("1E+11")).toBe("100000000000");
  });
  it("空串返 null", () => {
    expect(normalizeUid("")).toBeNull();
  });
});

describe("parseChineseDate", () => {
  it("2026/5/1 20:19 → Date", () => {
    const d = parseChineseDate("2026/5/1 20:19");
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(4); // 5月 = index 4
    expect(d!.getDate()).toBe(1);
    expect(d!.getHours()).toBe(20);
    expect(d!.getMinutes()).toBe(19);
  });
  it("带秒数 2026/5/1 20:19:30", () => {
    const d = parseChineseDate("2026/5/1 20:19:30");
    expect(d!.getSeconds()).toBe(30);
  });
  it("空串返 null", () => {
    expect(parseChineseDate("")).toBeNull();
  });
  it("格式错误返 null", () => {
    expect(parseChineseDate("2026-05-01")).toBeNull();
  });
});

describe("parseIntSafe", () => {
  it("纯数字", () => {
    expect(parseIntSafe("12345")).toBe(12345);
  });
  it("千分位逗号", () => {
    expect(parseIntSafe("12,345")).toBe(12345);
  });
  it("空串返 0", () => {
    expect(parseIntSafe("")).toBe(0);
    expect(parseIntSafe(undefined)).toBe(0);
  });
  it("非数字返 0", () => {
    expect(parseIntSafe("abc")).toBe(0);
  });
});
