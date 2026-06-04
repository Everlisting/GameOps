import { describe, it, expect } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("基础逗号切分", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("剥 UTF-8 BOM", () => {
    expect(parseCsv("﻿a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("CRLF / LF / 混合都能切", () => {
    expect(parseCsv("a,b\r\n1,2\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("末行无换行符也保留", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("末尾换行不产空行", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("中间空行跳过", () => {
    expect(parseCsv("a,b\n\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("双引号包字段 + 内嵌逗号", () => {
    expect(parseCsv(`a,"b,c",d`)).toEqual([["a", "b,c", "d"]]);
  });

  it("转义双引号 \"\"", () => {
    expect(parseCsv(`a,"he said ""hi""",d`)).toEqual([
      ["a", 'he said "hi"', "d"],
    ]);
  });

  it("引号字段内换行不分行", () => {
    expect(parseCsv(`a,"line1\nline2",c`)).toEqual([["a", "line1\nline2", "c"]]);
  });

  it("中文标题里的全角逗号不影响切分", () => {
    const csv = "标题,数\n这一次，我重生了,160";
    expect(parseCsv(csv)).toEqual([
      ["标题", "数"],
      ["这一次，我重生了", "160"],
    ]);
  });

  it("空 CSV 返回空数组", () => {
    expect(parseCsv("")).toEqual([]);
  });
});
