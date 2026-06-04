/**
 * 最小 RFC 4180 CSV parser。
 *
 * 处理:
 *   - UTF-8 BOM(EF BB BF → 字符串里是 U+FEFF)
 *   - 双引号字段、字段内逗号、字段内换行
 *   - 转义双引号 ""
 *   - CRLF / LF / CR 三种行结束符
 *   - 末行无换行
 *   - 完全空行(被忽略)
 *
 * 不处理(都是抖音/易闪导出的 CSV 用不到的):
 *   - 非逗号分隔(如分号)
 *   - 字符集自动探测(默认 UTF-8;调用方负责解码)
 *   - 流式分块(一次性 in-memory;200MB 上限在 API 层兜底)
 */
export function parseCsv(input: string): string[][] {
  // 剥 BOM
  let text = input;
  if (text.length > 0 && text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const n = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const finishRow = () => {
    pushField();
    // 完全空行(只有一个空字段)跳过,避免 trailing 换行造成空行污染
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < n; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        // 紧跟另一个引号 = 转义引号;否则结束 quoted 模式
        if (i + 1 < n && text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      pushField();
      continue;
    }
    if (c === "\r") {
      // CRLF 跳掉下一个 \n
      if (i + 1 < n && text[i + 1] === "\n") i++;
      finishRow();
      continue;
    }
    if (c === "\n") {
      finishRow();
      continue;
    }
    field += c;
  }

  // 文件末尾没有换行时,落最后一行
  if (field !== "" || row.length > 0) finishRow();

  return rows;
}
