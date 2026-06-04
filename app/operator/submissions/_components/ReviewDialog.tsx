"use client";

/**
 * 稿件审核弹窗:左侧 iframe 预览视频,右侧三子审核卡(标题 / 内容 / 易闪)。
 * 替代原来 /operator/submissions/[id] 跳转 — 不离开列表页。
 *
 * iframe 来源策略:
 *   - 抖音(platform 含「抖音 / douyin」 或 url 含 douyin.com):优先用官方 open player
 *       https://open.douyin.com/player/video?vid={vid}&autoplay=1
 *     vid 优先用 externalId,缺则从 /video/(\d+) 解析。两者都没有则回退原 url。
 *   - 其他平台:直接 iframe 原 url。
 *
 * 用 open player 主要解决:抖音网页站设 X-Frame-Options=DENY,直接 iframe 空白;
 * open.douyin.com/player 是官方对外的可嵌入播放页。
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ReviewStatus } from "@prisma/client";
import { ExternalLink, Maximize2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { SubmissionBadge } from "@/app/(creator)/_components/StatusBadge";
import { ReviewPill } from "./StatusPill";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import type { SubmissionRow } from "./SubmissionsTable";

const STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING: "待审核",
  APPROVED: "通过",
  REJECTED: "未通过",
};

const STATUS_OPTIONS: ReviewStatus[] = ["PENDING", "APPROVED", "REJECTED"];

/**
 * 解析稿件信息,确定要走哪种嵌入模式。
 *   - douyin + 有 vid → 异步查 /api/operator/submissions/embed 拿官方 iframe src
 *   - 否则 → 直接用 row.url
 */
function resolveSource(row: {
  url: string;
  platform: string;
  externalId: string | null;
}): { vid: string | null; isDouyin: boolean } {
  const isDouyin =
    /抖音|douyin/i.test(row.platform) || /douyin\.com/i.test(row.url);
  if (!isDouyin) return { vid: null, isDouyin: false };
  let vid = row.externalId ?? "";
  if (!vid) {
    const m = /\/video\/(\d+)/.exec(row.url);
    if (m) vid = m[1];
  }
  return { vid: vid || null, isDouyin: true };
}

export default function ReviewDialog({
  row,
  open,
  onOpenChange,
}: {
  row: SubmissionRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        {row && <DialogBody row={row} />}
      </DialogContent>
    </Dialog>
  );
}

function DialogBody({ row }: { row: SubmissionRow }) {
  const router = useRouter();
  const [iframeKey, setIframeKey] = useState(0);
  const { vid, isDouyin } = resolveSource(row);

  // 异步拉抖音官方 iframe;非抖音直接 row.url
  const [embedSrc, setEmbedSrc] = useState<string | null>(null);
  const [embedLoading, setEmbedLoading] = useState(false);

  // 三子审核状态由 DialogBody 持有,共用一条备注;切换稿件时全部重置成 DB 值
  const [titleStatus, setTitleStatus] = useState<ReviewStatus>(row.titleStatus);
  const [contentStatus, setContentStatus] = useState<ReviewStatus>(
    row.contentStatus,
  );
  const [yishanStatus, setYishanStatus] = useState<ReviewStatus>(
    row.yishanStatus,
  );
  // 三子原本各存一份 note;UI 合并成一条,初值取第一个非空,避免静默丢历史备注
  const [note, setNote] = useState<string>(
    row.titleNote ?? row.contentNote ?? row.yishanNote ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setTitleStatus(row.titleStatus);
    setContentStatus(row.contentStatus);
    setYishanStatus(row.yishanStatus);
    setNote(row.titleNote ?? row.contentNote ?? row.yishanNote ?? "");
    setError(null);
    setSavedAt(null);
  }, [
    row.id,
    row.titleStatus,
    row.contentStatus,
    row.yishanStatus,
    row.titleNote,
    row.contentNote,
    row.yishanNote,
  ]);

  // 每次切换稿件,重置 iframe + 重新查官方 iframe;parent 通过 row.id 触发
  useEffect(() => {
    setIframeKey((k) => k + 1);
    let aborted = false;
    if (!isDouyin || !vid) {
      setEmbedSrc(row.url);
      setEmbedLoading(false);
      return;
    }
    setEmbedSrc(null);
    setEmbedLoading(true);
    fetch(`/api/operator/submissions/embed?vid=${encodeURIComponent(vid)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        if (aborted) return;
        // 官方拿到优先,否则用兜底
        setEmbedSrc(data.url || data.fallback);
      })
      .catch(() => {
        if (aborted) return;
        // 接口完全不通时本地兜底
        setEmbedSrc(
          `https://open.douyin.com/player/video?vid=${encodeURIComponent(vid)}&autoplay=1`,
        );
      })
      .finally(() => {
        if (!aborted) setEmbedLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [row.id, row.url, vid, isDouyin]);

  const noteOrNull = note.trim() ? note.trim() : null;
  const dirty =
    titleStatus !== row.titleStatus ||
    contentStatus !== row.contentStatus ||
    yishanStatus !== row.yishanStatus ||
    (noteOrNull ?? "") !==
      ((row.titleNote ?? row.contentNote ?? row.yishanNote ?? "") || "");

  async function submitReview() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/operator/submissions/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: { status: titleStatus, note: noteOrNull },
          content: { status: contentStatus, note: noteOrNull },
          yishan: { status: yishanStatus, note: noteOrNull },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "提交失败");
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch {
      setError("网络错误,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex max-h-[95vh] flex-col">
      {/* 顶部:标题 + 元信息 + 状态;视频控制按钮一并放在右侧,弹窗内不再有「视频预览」第二级 chrome */}
      <div className="border-b border-border px-5 py-4 pr-12">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-[60%]">
            <DialogTitle className="line-clamp-2 break-words text-base font-semibold">
              {row.title}
            </DialogTitle>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>@{row.creator.nickname}</span>
              {row.activity && (
                <Link
                  href={`/operator/activities/${row.activity.id}`}
                  className="hover:text-primary"
                >
                  {row.activity.name}
                </Link>
              )}
              <span>{row.platform}</span>
              {row.externalId && (
                <span className="font-mono text-[10px] opacity-70">
                  #{row.externalId}
                </span>
              )}
              <span>· {fmtDateTime(new Date(row.createdAt))}</span>
              {isDouyin && vid ? (
                <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-700 dark:text-sky-300">
                  抖音官方播放器
                </span>
              ) : (
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  title={row.url}
                >
                  <ExternalLink className="size-3" />
                  原链接
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1">
              <SubmissionBadge status={row.status} />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setIframeKey((k) => k + 1)}
                title="重新加载视频"
              >
                <RefreshCw className="size-3.5" />
              </Button>
              <Button
                asChild
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                title="在新窗口打开原链接"
              >
                <a href={row.url} target="_blank" rel="noreferrer">
                  <Maximize2 className="size-3.5" />
                </a>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <ReviewPill status={row.titleStatus} label="标" />
              <ReviewPill status={row.contentStatus} label="内" />
              <ReviewPill status={row.yishanStatus} label="易" />
            </div>
          </div>
        </div>
      </div>

      {/* 主体:左 iframe + 右 三子审核;视频列按 iframe 实际宽度固定,右列吃剩余 */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex min-h-[420px] items-center justify-center overflow-hidden lg:border-r lg:border-border">
          {embedLoading || !embedSrc ? (
            <div className="px-8 text-xs text-muted-foreground">加载视频…</div>
          ) : (
            <iframe
              key={iframeKey}
              src={embedSrc}
              title={row.title}
              referrerPolicy="no-referrer"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
              className="aspect-[325/720] block h-full max-h-full w-auto max-w-full border-0 align-bottom"
            />
          )}
        </div>

        {/* 三张审核卡 + 备注 按 1:1:1:2 比例分摊右列高度,gap 比之前大,留点呼吸 */}
        <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
          <ReviewCard
            label="视频标题"
            helper="标题是否合规、是否与活动主题一致"
            status={titleStatus}
            onChange={setTitleStatus}
          />
          <ReviewCard
            label="视频内容"
            helper="视频本身是否合规、内容质量"
            status={contentStatus}
            onChange={setContentStatus}
          />
          <ReviewCard
            label="易闪审核"
            helper="导入易闪结果或人工补录"
            status={yishanStatus}
            onChange={setYishanStatus}
          />

          <Card className="flex flex-[2] flex-col gap-3 p-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label className="text-xs">备注</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                placeholder="可选,运营内部备注;三项审核共用同一条备注"
                className="min-h-[80px] flex-1 resize-none text-xs"
              />
            </div>
            <div className="flex shrink-0 items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {error
                  ? null
                  : savedAt && Date.now() - savedAt < 4000
                    ? "已提交"
                    : ""}
              </span>
              <Button
                size="sm"
                onClick={submitReview}
                disabled={submitting || !dirty}
              >
                {submitting ? "提交中…" : "提交审核"}
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * 三子审核单卡(受控):只负责展示标签 + 三态按钮,状态完全由父级持有。
 * 备注和提交在父级合并为一条,这里不再放 textarea / save。
 */
function ReviewCard({
  label,
  helper,
  status,
  onChange,
}: {
  label: string;
  helper: string;
  status: ReviewStatus;
  onChange: (next: ReviewStatus) => void;
}) {
  return (
    <Card className="flex flex-1 flex-col justify-between gap-3 p-3">
      <div className="min-w-0">
        <h3 className="text-sm font-medium">{label}</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{helper}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              status === s
                ? s === "APPROVED"
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : s === "REJECTED"
                    ? "border-red-500 bg-red-500 text-white"
                    : "border-amber-500 bg-amber-500 text-white"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
    </Card>
  );
}
