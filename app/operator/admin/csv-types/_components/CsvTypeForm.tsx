"use client";

/**
 * csvType 创建 / 编辑表单。
 *
 * 列表编辑 + 「从文件导入」按钮(浏览器内 xlsx 解析,直接填表;
 * 也支持服务端 /preview-headers 端点用于较大文件,但浏览器解析更快无 round-trip)。
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLUMN_TYPES, type ColumnDef } from "@/lib/validation/csv-type";

type ColumnType = (typeof COLUMN_TYPES)[number];

export type CsvTypeFormInitial = {
  id?: string;
  name: string;
  label: string;
  description: string;
  columns: ColumnDef[];
};

export const EMPTY_INITIAL: CsvTypeFormInitial = {
  name: "",
  label: "",
  description: "",
  columns: [],
};

const TYPE_LABEL: Record<ColumnType, string> = {
  string: "字符串",
  number: "数字",
  date: "日期",
  url: "URL",
};

export default function CsvTypeForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial: CsvTypeFormInitial;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(initial.name);
  const [label, setLabel] = React.useState(initial.label);
  const [description, setDescription] = React.useState(initial.description);
  const [columns, setColumns] = React.useState<ColumnDef[]>(initial.columns);
  const [submitting, setSubmitting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [importInfo, setImportInfo] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  function updateCol(i: number, patch: Partial<ColumnDef>) {
    const next = columns.slice();
    next[i] = { ...next[i], ...patch };
    setColumns(next);
  }
  function removeCol(i: number) {
    setColumns(columns.filter((_, idx) => idx !== i));
  }
  function addCol() {
    setColumns([...columns, { name: "", type: "string" }]);
  }

  async function importFromFile(file: File) {
    setError(null);
    setImporting(true);
    setImportInfo(null);
    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("文件超过 5 MB");
      }
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error("文件没有 sheet");
      const sheet = wb.Sheets[sheetName];
      const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        blankrows: false,
      });
      if (matrix.length === 0) throw new Error("文件是空的");
      const headers = matrix[0].map((h) => String(h ?? "").trim());
      const dataRows = matrix.slice(1, 51);
      const inferred: ColumnDef[] = headers.map((h, idx) => {
        const colName = h || `col_${idx + 1}`;
        const samples = dataRows
          .map((r) => String(r[idx] ?? "").trim())
          .filter((s) => s.length > 0);
        return { name: colName, type: inferType(samples) };
      });
      setColumns(inferred);
      setImportInfo(
        `已抽取 ${inferred.length} 列(从 ${file.name} sheet「${sheetName}」)`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        ...(mode === "create" ? { name } : { name }),
        label,
        description: description || undefined,
        columns,
      };
      const url =
        mode === "create"
          ? "/api/admin/csv-types"
          : `/api/admin/csv-types/${initial.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const details = data?.error?.details;
        let msg = data?.error?.message ?? "提交失败";
        if (Array.isArray(details)) {
          msg = details.map((d: { message: string }) => d.message).join(";");
        }
        throw new Error(msg);
      }
      router.push("/operator/admin/csv-types");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete() {
    if (!initial.id) return;
    if (!confirm(`删除 csvType「${name}」?有 Job 引用时会被拒绝。`)) return;
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/csv-types/${initial.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "删除失败");
      router.push("/operator/admin/csv-types");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-medium">基本信息</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-[11px]">name *(程序 key)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="douyin_video_detail"
              className="font-mono text-xs"
              disabled={mode === "edit" && initial.name === "douyin_video_detail"}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              字母 / 数字 / 下划线;首字符是字母。落盘时会用作 <code>data/raw/&lt;name&gt;/</code> 子目录,改名要小心。
            </p>
          </div>
          <div>
            <Label className="text-[11px]">label *(显示名)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="抖音视频明细表"
            />
          </div>
        </div>
        <div>
          <Label className="text-[11px]">说明(可选)</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="字段含义、来源、产出脚本说明等"
            rows={2}
          />
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">列定义</h2>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFromFile(f);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-3.5" />
              {importing ? "解析中…" : "从文件导入表头"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={addCol}>
              <Plus className="size-3.5" />
              手动加一列
            </Button>
          </div>
        </div>
        {importInfo && (
          <p className="rounded-md border border-emerald-200/50 bg-emerald-50/60 px-2 py-1 text-[11px] text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300">
            {importInfo}(类型已按前 50 行做了推断,需要手动确认)
          </p>
        )}
        {columns.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            还没有列。点上方按钮添加或从样本文件导入。
          </p>
        ) : (
          <div className="space-y-1.5">
            {columns.map((c, i) => (
              <div
                key={i}
                className="grid grid-cols-12 items-center gap-2 rounded border border-border bg-background p-2"
              >
                <div className="col-span-1 text-center text-[11px] text-muted-foreground tabular-nums">
                  {i + 1}
                </div>
                <div className="col-span-5">
                  <Input
                    value={c.name}
                    onChange={(e) => updateCol(i, { name: e.target.value })}
                    placeholder="列名(CSV 表头)"
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="col-span-4">
                  <Input
                    value={c.label ?? ""}
                    onChange={(e) =>
                      updateCol(i, { label: e.target.value || undefined })
                    }
                    placeholder="显示名(可选)"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="col-span-1">
                  <Select
                    value={c.type}
                    onValueChange={(v) => updateCol(i, { type: v as ColumnType })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLUMN_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => removeCol(i)}
                    title="删除该列"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        {mode === "edit" ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            onClick={onDelete}
            disabled={deleting || submitting}
          >
            <Trash2 className="size-3.5" />
            删除 csvType
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/operator/admin/csv-types")}
          >
            取消
          </Button>
          <Button onClick={submit} disabled={submitting || deleting}>
            {submitting ? "提交中…" : mode === "create" ? "创建" : "保存"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function inferType(samples: string[]): ColumnType {
  const nonEmpty = samples.filter((s) => s.length > 0);
  if (nonEmpty.length === 0) return "string";
  if (nonEmpty.every((s) => /^https?:\/\//i.test(s))) return "url";
  const dateRe = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(\s+\d{1,2}:\d{2}(:\d{2})?)?$/;
  if (nonEmpty.every((s) => dateRe.test(s))) return "date";
  if (nonEmpty.every((s) => /^-?\d+(\.\d+)?$/.test(s.replace(/[,\s]/g, "")))) {
    return "number";
  }
  return "string";
}
