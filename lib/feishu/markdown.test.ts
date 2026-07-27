import { describe, it, expect } from "vitest";

import { mdToCardElements } from "./markdown";

type El = {
  tag: string;
  content?: string;
  columns?: Array<{ display_name: string; name: string; data_type: string }>;
  rows?: Array<Record<string, string>>;
};

describe("mdToCardElements", () => {
  it("无表格 → 单个 markdown 元素", () => {
    const els = mdToCardElements("**hello** [x](http://a)") as El[];
    expect(els).toEqual([{ tag: "markdown", content: "**hello** [x](http://a)" }]);
  });

  it("GFM 表格 → table 组件,前后文本各成一个 markdown 元素", () => {
    const md = [
      "结论:对比如下",
      "",
      "| 指标 | A | B |",
      "| --- | --- | --- |",
      "| 播放量 | 2.5亿 | 7.66亿 |",
      "| 稿件数 | 50 | 50 |",
      "",
      "以上。",
    ].join("\n");
    const els = mdToCardElements(md) as El[];
    const table = els.find((e) => e.tag === "table");
    expect(table).toBeTruthy();
    expect(table?.columns?.map((c) => c.display_name)).toEqual(["指标", "A", "B"]);
    expect(table?.columns?.[0].data_type).toBe("lark_md");
    expect(table?.rows).toHaveLength(2);
    expect(table?.rows?.[0]).toEqual({ c0: "播放量", c1: "2.5亿", c2: "7.66亿" });
    expect(els.filter((e) => e.tag === "markdown")).toHaveLength(2);
  });

  it("表格 cell 保留 markdown 链接", () => {
    const md = "| 作品 |\n| --- |\n| [《x》](http://v/1) |";
    const els = mdToCardElements(md) as El[];
    const table = els.find((e) => e.tag === "table");
    expect(table?.rows?.[0].c0).toBe("[《x》](http://v/1)");
  });

  it("行列不齐时缺列补空串", () => {
    const md = "| a | b | c |\n| --- | --- | --- |\n| 1 | 2 |";
    const els = mdToCardElements(md) as El[];
    const table = els.find((e) => e.tag === "table");
    expect(table?.rows?.[0]).toEqual({ c0: "1", c1: "2", c2: "" });
  });
});
