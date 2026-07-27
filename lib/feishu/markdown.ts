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
