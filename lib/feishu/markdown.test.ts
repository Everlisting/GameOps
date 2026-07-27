import { describe, it, expect } from "vitest";

import { mdToCardElements, chunkCardElements } from "./markdown";

type El = {
  tag: string;
  content?: string;
  columns?: Array<{ display_name: string; name: string; data_type: string }>;
  rows?: Array<Record<string, string>>;
};

const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v), "utf8");

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

describe("chunkCardElements", () => {
  it("未超限 → 单块", () => {
    const els = [
      { tag: "markdown", content: "hello" },
      { tag: "markdown", content: "world" },
    ];
    const chunks = chunkCardElements(els, 20000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(2);
  });

  it("多个元素累加超限 → 拆多块,每块都不超限", () => {
    // 每个 markdown ~60 字节,限 100 字节 → 每块最多 1 个
    const els = Array.from({ length: 5 }, (_, i) => ({
      tag: "markdown",
      content: `段落 ${i} `.padEnd(50, "x"),
    }));
    const chunks = chunkCardElements(els, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(bytes(c)).toBeLessThanOrEqual(100 + bytes({ tag: "markdown", content: "" }));
    // 元素总数守恒
    expect(chunks.flat()).toHaveLength(5);
  });

  it("超大表格 → 按行拆成多个 table,列定义保留、行守恒", () => {
    const columns = [
      { name: "c0", display_name: "主播", data_type: "lark_md" },
      { name: "c1", display_name: "播放量", data_type: "lark_md" },
    ];
    const rows = Array.from({ length: 20 }, (_, i) => ({ c0: `主播${i}`, c1: `${i}00万` }));
    const big = [{ tag: "table", columns, rows }];
    const chunks = chunkCardElements(big, 400);
    // 拆成多块,每块一个 table
    expect(chunks.length).toBeGreaterThan(1);
    const tables = chunks.flat() as El[];
    for (const t of tables) {
      expect(t.tag).toBe("table");
      expect(t.columns).toEqual(columns); // 每个分片都带完整列定义
    }
    // 所有分片的行数之和 = 原行数
    const totalRows = tables.reduce((n, t) => n + (t.rows?.length ?? 0), 0);
    expect(totalRows).toBe(20);
  });

  it("空输入 → 返回含原数组的单块(不炸)", () => {
    expect(chunkCardElements([], 100)).toEqual([[]]);
  });

  it("表格数超单卡上限 → 拆卡,每卡表格数不超限(飞书 11310)", () => {
    // 5 个小表格 + 穿插文字,限每卡最多 2 个表格
    const els: unknown[] = [];
    for (let i = 0; i < 5; i++) {
      els.push({ tag: "markdown", content: `第 ${i} 节` });
      els.push({ tag: "table", columns: [{ name: "c0", display_name: "x", data_type: "lark_md" }], rows: [{ c0: "1" }] });
    }
    const chunks = chunkCardElements(els, 20000, 100, 2);
    // 每块表格数 ≤ 2
    for (const c of chunks) {
      const tableCount = (c as El[]).filter((e) => e.tag === "table").length;
      expect(tableCount).toBeLessThanOrEqual(2);
    }
    // 表格总数守恒
    const totalTables = chunks.flat().filter((e) => (e as El).tag === "table").length;
    expect(totalTables).toBe(5);
  });
});
