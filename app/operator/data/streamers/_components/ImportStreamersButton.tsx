"use client";

/**
 * 「导入名单」按钮 + 弹窗:运营上传主播名单(.csv / .xlsx / .xls),
 * 走 /api/operator/data/streamers/import,按 (平台, UID) upsert 到 AnchorStat。
 *
 * 名单是主播数据页的「名册」来源(独立于视频/直播明细),保证没发作品的主播也在列。
 * 只写身份 + 花名册字段,缺列不冲空;数值指标由页面按 UID 聚合明细。
 * 成功后 router.refresh() 刷新列表与统计。
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Upload } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ImportResult = {
  rowCount: number;
  fileName: string;
};

// 平台下拉:value = 归一化平台码(与后端 ALLOWED_PLATFORMS 一致),label = 展示名
const PLATFORM_OPTIONS = [
  { value: "douyin", label: "Douyin" },
  { value: "kuaishou", label: "KuaiShou" },
  { value: "bilibili", label: "BiliBili" },
] as const;

export default function ImportStreamersButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [platform, setPlatform] = React.useState<string>("douyin");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setFile(null);
      setPlatform("douyin");
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
      fd.append("platform", platform);
      const res = await fetch("/api/operator/data/streamers/import", {
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
          导入名单
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>导入主播名单</DialogTitle>
          <DialogDescription>
            上传主播名单(.csv / .xlsx),按 平台 + UID upsert。平台由下方下拉选定,对整份名单生效。
            识别列:UID(必需)/ 主播昵称 / 抖音号 / 入会时间 / 团号 / 运营经纪人 / 招募经纪人 /(可选)粉丝量。
            作品数、播放量等指标由页面按 UID 聚合明细,无需在名单里提供。
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
                入库 / 更新 <strong className="tabular-nums">{result.rowCount}</strong> 位主播
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label htmlFor="import-platform" className="text-sm font-medium">
                平台
              </label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger id="import-platform" className="w-full">
                  <SelectValue placeholder="选择平台" />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORM_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                整份名单按此平台入库,覆盖表内「主播平台」列。
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
              <Button size="sm" onClick={submit} disabled={!file || submitting}>
                {submitting ? "导入中…" : "开始导入"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
