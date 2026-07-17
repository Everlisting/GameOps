"use client";

/**
 * 「导入数据」按钮 + 弹窗:运营手动上传抖音视频明细表(.csv / .xlsx / .xls),
 * 走 /api/operator/data/videos/import,与爬虫 agent 上报同一个 parser。
 *
 * 用于补录 / 回填(例如历史数据的字段修复),不经过 Job/Task。
 * 成功后 router.refresh() 刷新列表与顶部统计。
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Upload } from "lucide-react";

import DatePickerField from "@/app/(creator)/_components/DatePickerField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ImportResult = {
  rowCount: number;
  hiddenCount: number;
  snapshotCount: number;
  dataDate: string | null;
  fileName: string;
};

/** 北京时区口径的「昨天」YYYY-MM-DD(运营机在国内,本地时间即北京时间)。 */
function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ImportVideosButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [dataDate, setDataDate] = React.useState<string>(yesterdayStr);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // 关闭弹窗时清空状态,下次打开是干净的
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setFile(null);
      setDataDate(yesterdayStr());
      setError(null);
      setResult(null);
      setSubmitting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function submit() {
    if (!file) return;
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dataDate", dataDate);
      const res = await fetch("/api/operator/data/videos/import", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.error?.details
          ? Object.values(data.error.details).flat().join(";")
          : "";
        setError(detail || data?.error?.message || "导入失败");
        return;
      }
      setResult(data as ImportResult);
      router.refresh();
    } catch {
      setError("网络错误,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="size-3.5" />
          导入
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>导入视频明细表</DialogTitle>
          <DialogDescription>
            上传抖音「视频明细表」(.csv / .xlsx),按稿件 ID 覆盖更新明细层。
            与爬虫上报同一份文件、同一套解析规则。
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-emerald-500" />
              <span>导入完成</span>
            </div>
            <div className="rounded-md border border-border p-3 text-sm">
              <div className="truncate text-xs text-muted-foreground">
                {result.fileName}
              </div>
              <div className="mt-1">
                入库 <strong className="tabular-nums">{result.rowCount}</strong> 条明细
                <span className="ml-2 text-xs text-muted-foreground">
                  · {result.dataDate ?? "今日"} 快照 {result.snapshotCount} 条
                </span>
              </div>
              {result.hiddenCount > 0 && (
                <div className="mt-1 text-xs text-muted-foreground">
                  判定为删除/隐藏(窗口内缺失或无标题):
                  <strong className="tabular-nums">{result.hiddenCount}</strong> 条
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <DatePickerField
                id="import-data-date"
                label="数据日期"
                value={dataDate}
                onChange={setDataDate}
                width="w-full"
              />
              <p className="text-xs text-muted-foreground">
                这批数据实际所属的日期(趋势快照落到这一天)。一般是昨天,可改。
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
              className="block w-full cursor-pointer rounded-md border border-input bg-transparent text-sm text-foreground file:mr-3 file:cursor-pointer file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-muted/70"
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                已选:<span className="font-medium">{file.name}</span> ·{" "}
                {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={submit}
                disabled={!file || !dataDate || submitting}
              >
                {submitting ? "导入中…" : "开始导入"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
