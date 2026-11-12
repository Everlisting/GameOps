import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  activityFiltersSchema, normalizeVideoLink, parseListRows, parsePastedList,
  videoFilterMatcher, videoFilterWhere, type ActivityFilters,
} from "./filters";

const video = {
  title: "率土之滨 创作", creatorUid: "001234567890123456789",
  url: "https://www.douyin.com/video/12345?from=search", platform: "douyin", externalId: "12345",
};

describe("专题稿件名单", () => {
  it("支持 Excel 粘贴的 CRLF、空行、表头和重复项，保留长 UID 与前导零", () => {
    const text = "\uFEFFUID\r\n001234567890123456789\r\n\r\nabc123\r\n001234567890123456789\r\n";
    expect(parsePastedList(text, "CREATORS")).toEqual(["001234567890123456789", "abc123"]);
    expect(parsePastedList("账号\tUID\n张三\t00123\n李四\t00456", "CREATORS")).toEqual(["00123", "00456"]);
    expect(() => parsePastedList("张三\t00123", "CREATORS")).toThrow("表头");
  });

  it("视频链接按真实抖音稿件去重，避免跟踪参数影响匹配", () => {
    expect(parsePastedList("视频链接\nhttps://www.douyin.com/video/12345?from=search\nhttps://www.iesdouyin.com/share/video/12345/#anchor", "VIDEOS"))
      .toEqual(["https://www.douyin.com/video/12345"]);
    expect(() => parsePastedList("javascript:alert(1)", "VIDEOS")).toThrow("视频链接格式");
    expect(normalizeVideoLink("https://youtube.com/watch?v=abc")).not.toBe(normalizeVideoLink("https://youtube.com/watch?v=def"));
  });

  it("文件要求正确表头，拒绝已损失精度的 Excel 数值 UID", () => {
    expect(() => parseListRows([["名单"], ["123"]], "CREATORS", true)).toThrow("UID");
    expect(() => parseListRows([["UID"], [1234567890123456789]], "CREATORS", true)).toThrow("精度");
    expect(parseListRows([["名称", "视频链接"], ["视频", video.url]], "VIDEOS", true)).toEqual(["https://www.douyin.com/video/12345"]);
  });

  it.each(["xlsx", "csv"] as const)("实际 %s 文件可读出指定列并保留文本 UID", (bookType) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["UID", "姓名"], [video.creatorUid, "测试作者"], [video.creatorUid, "重复"]]), "名单");
    const bytes: Uint8Array = XLSX.write(workbook, { bookType, type: "buffer" });
    const parsed = XLSX.read(bytes, { type: "array", raw: true, codepage: 65001 });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(parsed.Sheets[parsed.SheetNames[0]], { header: 1, raw: true, defval: "" });
    expect(parseListRows(rows, "CREATORS", true)).toEqual([video.creatorUid]);
  });
});

describe("专题筛选配置", () => {
  it("旧标题筛选转换后保留 ALL 和 ANY 语义，旧空关键词仍匹配全部", () => {
    const converted = activityFiltersSchema.parse({ keywords: ["率土", "其他"], match: "ANY" });
    expect(converted.match).toBe("ALL");
    expect(videoFilterMatcher(converted)(video)).toBe(true);
    expect(videoFilterMatcher(activityFiltersSchema.parse({ keywords: [], match: "ANY" }))(video)).toBe(true);
  });

  it("标题、UID 和视频名单支持全部满足与任一满足，名单使用精确匹配", () => {
    const filters: ActivityFilters = { match: "ALL", rules: [
      { kind: "TITLE", match: "ALL", values: ["率土"] },
      { kind: "CREATORS", values: [video.creatorUid] },
      { kind: "VIDEOS", values: ["https://www.douyin.com/video/12345"] },
    ] };
    expect(videoFilterMatcher(filters)(video)).toBe(true);
    expect(videoFilterMatcher(filters)({ ...video, creatorUid: "1234567890123456789" })).toBe(false);
    expect(videoFilterMatcher({ ...filters, match: "ANY" })({ ...video, title: "其他", creatorUid: null })).toBe(true);
    expect(videoFilterWhere({ ...filters, match: "ANY" })).toEqual({});
    expect(videoFilterWhere(filters)).toEqual({ AND: [
      { AND: [{ title: { contains: "率土", mode: "insensitive" } }] }, { creatorUid: { in: [video.creatorUid] } },
    ] });
  });

  it("大名单使用 Set 匹配，避免查询参数上限，也不截断名单", () => {
    const values = Array.from({ length: 30_000 }, (_, i) => String(i));
    const filters: ActivityFilters = { match: "ALL", rules: [{ kind: "CREATORS", values }] };
    expect(videoFilterWhere(filters)).toEqual({});
    expect(videoFilterMatcher(filters)({ ...video, creatorUid: "29999" })).toBe(true);
  });

  it("拒绝空的配置名单、重复字段和无效链接，避免误用旧格式跳过校验", () => {
    expect(activityFiltersSchema.safeParse({ match: "ALL", rules: [{ kind: "CREATORS", values: [] }] }).success).toBe(false);
    expect(activityFiltersSchema.safeParse({ match: "ALL", rules: [{ kind: "VIDEOS", values: ["not a link"] }] }).success).toBe(false);
    expect(activityFiltersSchema.safeParse({ match: "ALL", keywords: [], rules: [{ kind: "CREATORS", values: [] }] }).success).toBe(false);
    expect(activityFiltersSchema.safeParse({ match: "ALL", rules: [
      { kind: "CREATORS", values: ["123"] }, { kind: "CREATORS", values: ["456"] },
    ] }).success).toBe(false);
  });
});
