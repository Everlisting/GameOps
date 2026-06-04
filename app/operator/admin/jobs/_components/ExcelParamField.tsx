"use client";

/**
 * EXCEL 类型参数的上传 + 解析 + 预览 UI。
 *
 * 浏览器端动态 import xlsx,首次选文件时才下载这个包(~600KB),
 * 没用 EXCEL 字段的 Job trigger 页面不付带宽成本。
 *
 * 解析流程:
 *   1. 接受 .xlsx / .xls / .csv,读取第 1 个 sheet
 *   2. 第 1 行作表头;检查 requiredColumns 都在
 *   3. 后续行转为 [{col: value}, ...] 数组,空行跳过
 *   4. value 序列化为这一行的 JSON 对象;上传到中台时整个数组作为该参数的值
 */
import * as React from "react";
import { Upload, FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";

const MAX_ROWS = 5000;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export default function ExcelParamField({
  inputId,
  requiredColumns,
  value,
  onChange,
}: {
  inputId: string;
  requiredColumns: string[];
  /** 当前值:解析后的行数组(或 undefined / null) */
  value: unknown;
  onChange: (rows: Array<Record<string, unknown>>) => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const rows = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
  const hasRows = rows.length > 0;

  async function onFile(file: File) {
    setError(null);
    setLoading(true);
    setFileName(file.name);
    try {
      if (file.size > MAX_BYTES) {
        throw new Error(`文件超过 ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB`);
      }
      // 动态 import,减少非 EXCEL 字段页面的 bundle 体积
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error("文件中没有 sheet");
      const sheet = wb.Sheets[sheetName];
      // 用 header:1 拿原始矩阵,自己处理表头校验
      const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        blankrows: false,
      });
      if (matrix.length === 0) throw new Error("文件是空的");
      const headers = matrix[0].map((h) => String(h).trim());
      const missing = requiredColumns.filter((c) => !headers.includes(c));
      if (missing.length > 0) {
        throw new Error(`缺少列:${missing.join("、")}`);
      }
      const dataRows = matrix.slice(1);
      if (dataRows.length > MAX_ROWS) {
        throw new Error(`行数超过 ${MAX_ROWS},先拆文件再上传`);
      }
      const out: Array<Record<string, unknown>> = [];
      for (const row of dataRows) {
        const obj: Record<string, unknown> = {};
        let nonEmpty = false;
        for (let i = 0; i < headers.length; i++) {
          const v = row[i];
          obj[headers[i]] = v ?? "";
          if (v !== undefined && v !== null && String(v).trim() !== "") {
            nonEmpty = true;
          }
        }
        if (nonEmpty) out.push(obj);
      }
      onChange(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFileName(null);
      // 清空当前值,避免半截脏数据
      onChange([]);
    } finally {
      setLoading(false);
      // 同一文件可以再次选择(浏览器 input 缓存清掉)
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="size-3.5" />
          {hasRows ? "重新上传" : "选择文件"}
        </Button>
        {fileName && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <FileSpreadsheet className="size-3.5" />
            {fileName}
          </span>
        )}
        {loading && <span className="text-[11px] text-muted-foreground">解析中…</span>}
      </div>

      <p className="text-[10px] text-muted-foreground">
        接受 .xlsx / .xls / .csv,第 1 行作表头,必须包含:
        <span className="ml-1 font-mono">{requiredColumns.join(" / ")}</span>
      </p>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
          {error}
        </p>
      )}

      {hasRows && !error && (
        <div className="rounded-md border border-border bg-muted/30 p-2 text-[11px]">
          <div className="mb-1 text-muted-foreground">
            已解析 {rows.length} 行,展示前 {Math.min(3, rows.length)} 行:
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                {requiredColumns.map((c) => (
                  <th key={c} className="px-1.5 py-1 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 3).map((r, i) => (
                <tr key={i} className="border-b border-border/40 last:border-b-0">
                  {requiredColumns.map((c) => (
                    <td key={c} className="truncate px-1.5 py-1 font-mono">
                      {String(r[c] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
