"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, History, LoaderCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { fmtDateTime } from "@/lib/format";
import type { VideoReviewRow } from "@/lib/video-reviews";
import { videoReviewHistorySchema, type VideoReviewHistory } from "@/lib/validation/video-review-history";
import { videoReviewLabels, videoReviewVariants } from "./VideoReviewTable";

export default function VideoReviewHistoryDialog({ row, onClose }: { row: VideoReviewRow; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<VideoReviewHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    async function load() {
      try {
        const response = await fetch(`/api/operator/video-reviews/${row.id}/logs?page=${page}`, { cache: "no-store", signal: controller.signal });
        const result: unknown = await response.json();
        if (!response.ok) throw new Error("审核日志加载失败，请重试。");
        const parsed = videoReviewHistorySchema.parse(result);
        if (!controller.signal.aborted) setData(parsed);
      } catch {
        if (!controller.signal.aborted) setError("审核日志加载失败，请检查网络后重试。");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [row.id, page, retry]);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:p-0">
      <DialogHeader className="shrink-0 border-b px-5 py-5 pr-10 sm:px-6 sm:pr-10">
        <DialogTitle>审核日志</DialogTitle>
        <p className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]" title={row.title}>{row.title}</p>
        <DialogDescription className="text-xs tabular-nums">作品ID {row.externalId} · 按审核时间从新到旧</DialogDescription>
      </DialogHeader>
      <div className="min-h-40 min-w-0 overflow-y-auto px-5 sm:px-6" aria-busy={loading}>
        {loading ? <p role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><LoaderCircle className="size-4 motion-safe:animate-spin" />正在加载审核记录…</p>
          : error ? <div className="flex flex-col items-center gap-3 py-12"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>重新加载</Button></div>
          : data && data.rows.length ? <ol className="divide-y">{data.rows.map((log) => <li key={log.id} className="flex min-w-0 flex-col gap-3 py-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="text-sm font-semibold [overflow-wrap:anywhere]">{log.reviewerName}</span>{log.actorUsername && log.actorUsername !== log.reviewerName && <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{log.actorUsername}</span>}{log.status && <Badge variant={videoReviewVariants[log.status]}>{videoReviewLabels[log.status]}</Badge>}</div>
              <time dateTime={log.reviewedAt} className="text-xs text-muted-foreground tabular-nums">{fmtDateTime(log.reviewedAt)}</time>
            </div>
            <dl className="flex flex-col gap-2 text-sm"><div className="flex min-w-0 gap-3"><dt className="shrink-0 text-muted-foreground">审核标签</dt><dd className="flex min-w-0 flex-col gap-1 [overflow-wrap:anywhere]">{log.tags.length ? log.tags.map((tag) => <span key={tag.id}>{tag.path}</span>) : log.tagSource === "missing" ? "历史记录未保存标签" : "未记录标签"}</dd></div>
              {log.note && <div className="flex min-w-0 gap-3"><dt className="shrink-0 text-muted-foreground">审核备注</dt><dd className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{log.note}</dd></div>}
            </dl>
            {(log.source !== "single" || log.tagSource === "current") && <p className="text-xs text-muted-foreground">{log.source === "current" ? "早期审核结果留存，完整操作明细未记录。" : log.source === "batch" ? "历史批量审核记录。" : ""}{log.tagSource === "current" && " 标签按当前名称展示。"}{log.tagSource === "retained" && " 标签按留存时名称展示。"}</p>}
          </li>)}</ol> : <Empty><EmptyHeader><EmptyMedia><History /></EmptyMedia><EmptyTitle>暂无审核记录</EmptyTitle><EmptyDescription>此稿件尚未保存审核结果，完成审核后将在这里显示记录。</EmptyDescription></EmptyHeader></Empty>}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-5 py-4 text-xs text-muted-foreground sm:px-6">
        <span className="tabular-nums">{data ? `共 ${data.total} 条 · 第 ${data.page} / ${data.totalPages} 页` : "每页20条"}</span>
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={loading || !!error || !data || data.page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft data-icon="inline-start" />上一页</Button><Button variant="outline" size="sm" disabled={loading || !!error || !data || data.page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>下一页<ChevronRight data-icon="inline-end" /></Button></div>
      </footer>
    </DialogContent>
  </Dialog>;
}
