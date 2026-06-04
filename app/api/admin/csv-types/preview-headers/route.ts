/**
 * POST /api/admin/csv-types/preview-headers
 *
 * 鉴权:ADMIN
 *
 * 入参:multipart/form-data 单字段 `file`(.xlsx / .xls / .csv)
 * 出参:{ columns: [{ name, type }] }
 *
 * 行为:
 *   - 读第 1 个 sheet 的第 1 行作表头
 *   - 扫前 50 数据行做类型推断:
 *     · 全部能 Number 转 → "number"
 *     · 全部 http(s):// 开头 → "url"
 *     · 全部 YYYY-MM-DD 或 YYYY/M/D 格式 → "date"
 *     · 其它 → "string"
 *   - 文件 ≤ 5 MB
 */
import * as XLSX from "xlsx";

import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { badRequest } from "@/lib/errors";
import { COLUMN_TYPES, type ColumnDef } from "@/lib/validation/csv-type";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const INFERENCE_ROWS = 50;

type ColumnType = (typeof COLUMN_TYPES)[number];

function inferType(samples: string[]): ColumnType {
  const nonEmpty = samples.map((s) => s.trim()).filter((s) => s.length > 0);
  if (nonEmpty.length === 0) return "string";

  if (nonEmpty.every((s) => /^https?:\/\//i.test(s))) return "url";

  const dateRe = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(\s+\d{1,2}:\d{2}(:\d{2})?)?$/;
  if (nonEmpty.every((s) => dateRe.test(s))) return "date";

  if (nonEmpty.every((s) => /^-?\d+(\.\d+)?$/.test(s.replace(/[,\s]/g, "")))) {
    return "number";
  }

  return "string";
}

export const POST = route(async (req) => {
  await requireRole("ADMIN");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("请求体必须是 multipart/form-data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("缺少 file 字段");
  if (file.size > MAX_BYTES) {
    throw badRequest(`文件超过 ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB`);
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer" });
  } catch (err) {
    throw badRequest(
      `解析文件失败:${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw badRequest("文件没有任何 sheet");
  const sheet = wb.Sheets[sheetName];

  const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  if (matrix.length === 0) throw badRequest("文件是空的");

  const headers = matrix[0].map((h) => String(h ?? "").trim());
  if (headers.length === 0) throw badRequest("表头行为空");

  // 取前 INFERENCE_ROWS 行做类型推断
  const dataRows = matrix.slice(1, 1 + INFERENCE_ROWS);
  const columns: ColumnDef[] = headers.map((name, colIdx) => {
    if (!name) {
      return { name: `col_${colIdx + 1}`, type: "string" };
    }
    const samples = dataRows.map((row) => String(row[colIdx] ?? ""));
    return { name, type: inferType(samples) };
  });

  return Response.json({ columns });
});
