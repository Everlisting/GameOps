/**
 * markdown → 飞书卡片(schema 2.0)元素转换。
 * GFM 表格 → 飞书 table 组件(cell 用 lark_md,支持加粗/链接);其余文本 → markdown 组件。
 * 让模型照常写 markdown(含表格与 [文本](url) 链接),发送时渲染成飞书原生格式。
 */

function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}
/** 分隔行:|---|:--:|--- 之类(必须含 -) */
function isSeparatorRow(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}
function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function buildTableElement(headers: string[], rows: string[][]): Record<string, unknown> {
  const columns = headers.map((h, idx) => ({
    name: `c${idx}`,
    display_name: h,
    data_type: "lark_md",
    width: "auto",
    horizontal_align: "left",
  }));
  const rowObjs = rows.map((cells) => {
    const o: Record<string, string> = {};
    headers.forEach((_, idx) => {
      o[`c${idx}`] = cells[idx] ?? "";
    });
    return o;
  });
  return { tag: "table", columns, rows: rowObjs };
}

/** 把 markdown 拆成飞书卡片 body.elements(2.0)。无表格时整体为一个 markdown 元素。 */
export function mdToCardElements(md: string): unknown[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const elements: unknown[] = [];
  let buf: string[] = [];

  const flush = () => {
    const t = buf.join("\n").trim();
    if (t) elements.push({ tag: "markdown", content: t });
    buf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isTableRow(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      flush();
      const headers = splitCells(line);
      const rows: string[][] = [];
      i += 2; // 跳过表头 + 分隔行
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitCells(lines[i]));
        i++;
      }
      i--; // 抵消 for 的 ++
      elements.push(buildTableElement(headers, rows));
      continue;
    }
    buf.push(line);
  }
  flush();

  return elements.length > 0 ? elements : [{ tag: "markdown", content: md }];
}

// ── 卡片分块(飞书交互卡片单条有大小上限,约 30KB;超限则拆成多张卡片)──────
// body.elements 预算保守取 20KB,给 header/config/外层包装留余量。
const MAX_CARD_BODY_BYTES = 20000;
// 飞书 2.0 卡片一张最多 200 个元素;留余量取 100。
const MAX_CARD_ELEMENTS = 100;
// 飞书对单张卡片的 table 组件数量有上限(超限报 ErrCode 11310);保守取 3。
const MAX_CARD_TABLES = 3;

type CardEl = Record<string, unknown>;

function byteLen(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v), "utf8");
}

/** 拆分过大的 table 元素:复用列定义,按行分成多个 table 元素。 */
function splitTableElement(el: CardEl, maxBytes: number): CardEl[] {
  const columns = el.columns;
  const rows = Array.isArray(el.rows) ? el.rows : [];
  const overhead = byteLen({ tag: "table", columns, rows: [] });
  const out: CardEl[] = [];
  let cur: unknown[] = [];
  let curBytes = overhead;
  for (const row of rows) {
    const rb = byteLen(row);
    if (cur.length > 0 && curBytes + rb > maxBytes) {
      out.push({ tag: "table", columns, rows: cur });
      cur = [];
      curBytes = overhead;
    }
    cur.push(row);
    curBytes += rb;
  }
  if (cur.length > 0) out.push({ tag: "table", columns, rows: cur });
  return out.length > 0 ? out : [el];
}

/** 拆分过大的 markdown 元素:按行分成多个 markdown 元素。 */
function splitMarkdownElement(el: CardEl, maxBytes: number): CardEl[] {
  const content = typeof el.content === "string" ? el.content : "";
  const lines = content.split("\n");
  const out: CardEl[] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (cur.length > 0 && Buffer.byteLength([...cur, line].join("\n"), "utf8") > maxBytes) {
      out.push({ tag: "markdown", content: cur.join("\n") });
      cur = [];
    }
    cur.push(line);
  }
  if (cur.length > 0) out.push({ tag: "markdown", content: cur.join("\n") });
  return out.length > 0 ? out : [el];
}

function splitOversized(el: CardEl, maxBytes: number): CardEl[] {
  if (el.tag === "table") return splitTableElement(el, maxBytes);
  if (el.tag === "markdown") return splitMarkdownElement(el, maxBytes);
  return [el]; // 未知类型不拆
}

/**
 * 把卡片元素按大小上限分块 —— 每块是一张卡片的 body.elements。
 * 优先在元素边界切;单个元素本身超限(如超长表格)则内部再拆(表格按行 / markdown 按行)。
 */
export function chunkCardElements(
  elements: unknown[],
  maxBytes = MAX_CARD_BODY_BYTES,
  maxElements = MAX_CARD_ELEMENTS,
  maxTables = MAX_CARD_TABLES,
): unknown[][] {
  const chunks: unknown[][] = [];
  let cur: unknown[] = [];
  let curBytes = 0;
  let curTables = 0;
  const flush = () => {
    if (cur.length > 0) {
      chunks.push(cur);
      cur = [];
      curBytes = 0;
      curTables = 0;
    }
  };
  const isTable = (el: unknown) => (el as CardEl)?.tag === "table";
  for (const el of elements) {
    const eb = byteLen(el);
    if (eb > maxBytes) {
      flush();
      for (const sub of splitOversized(el as CardEl, maxBytes)) chunks.push([sub]);
      continue;
    }
    // 超字节预算 / 超元素数 / 超单卡表格数上限,都切块
    if (
      cur.length > 0 &&
      (curBytes + eb > maxBytes ||
        cur.length >= maxElements ||
        (isTable(el) && curTables >= maxTables))
    ) {
      flush();
    }
    cur.push(el);
    curBytes += eb;
    if (isTable(el)) curTables++;
  }
  flush();
  return chunks.length > 0 ? chunks : [elements];
}
