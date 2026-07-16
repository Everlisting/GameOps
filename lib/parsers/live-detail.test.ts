import { describe, it, expect } from "vitest";
import { _testing } from "./live-detail";

const { uidFromUid2, normalizeUid, parseDateUtc, parseIntSafe, parseFloatSafe } = _testing;

describe("uidFromUid2", () => {
  it("去掉 UID 前缀", () => {
    expect(uidFromUid2("UID998795868644135")).toBe("998795868644135");
  });
  it("小写 uid 前缀也认", () => {
    expect(uidFromUid2("uid12345")).toBe("12345");
  });
  it("已是纯数字原样返回", () => {
    expect(uidFromUid2("99162691563")).toBe("99162691563");
  });
  it("空 / 非该形态返回 null", () => {
    expect(uidFromUid2("")).toBeNull();
    expect(uidFromUid2("abc")).toBeNull();
  });
});

describe("normalizeUid", () => {
  it("科学计数法还原(UID 列被 Excel 转)", () => {
    expect(normalizeUid("9.98796E+14")).toBe("998796000000000");
  });
  it("纯数字原样", () => {
    expect(normalizeUid("99162691563")).toBe("99162691563");
  });
});

describe("parseDateUtc", () => {
  it("斜杠日期 → UTC 零点(不因本地时区偏移)", () => {
    const d = parseDateUtc("2026/7/1");
    expect(d?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
  it("短横线日期", () => {
    const d = parseDateUtc("2026-07-14");
    expect(d?.toISOString()).toBe("2026-07-14T00:00:00.000Z");
  });
  it("带时间 / 非法返回 null", () => {
    expect(parseDateUtc("2026/7/1 20:00")).toBeNull();
    expect(parseDateUtc("")).toBeNull();
  });
});

describe("parseFloatSafe", () => {
  it("小数", () => {
    expect(parseFloatSafe("2.13")).toBe(2.13);
  });
  it("百分号 / 千分位容忍", () => {
    expect(parseFloatSafe("11.52%")).toBe(11.52);
    expect(parseFloatSafe("1,234.5")).toBe(1234.5);
  });
  it("空 / 非数字返回 0", () => {
    expect(parseFloatSafe("")).toBe(0);
    expect(parseFloatSafe("--")).toBe(0);
  });
});

describe("parseIntSafe", () => {
  it("千分位逗号容忍", () => {
    expect(parseIntSafe("1,877")).toBe(1877);
  });
  it("小数串按非整数返回 0", () => {
    expect(parseIntSafe("2.13")).toBe(0);
  });
});
