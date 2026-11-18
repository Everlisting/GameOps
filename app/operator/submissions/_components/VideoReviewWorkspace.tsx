"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type {
  loadVideoReviews,
  VideoReviewSearch,
  VideoReviewRow,
} from "@/lib/video-reviews";
import type { flattenReviewTags } from "@/lib/review-tags";
import SubmissionsFilters from "./SubmissionsFilters";
import VideoReviewTable from "./VideoReviewTable";
import VideoReviewDialog from "./VideoReviewDialog";
import VideoReviewHistoryDialog from "./VideoReviewHistoryDialog";
import ReviewPeriodSelect, { type ReviewPeriodOption } from "./ReviewPeriodSelect";

export default function VideoReviewWorkspace({
  data,
  searchParams,
  tags,
  reviewerOnly = false,
  periodCards,
  periods,
}: {
  data: Awaited<ReturnType<typeof loadVideoReviews>>;
  searchParams: VideoReviewSearch;
  tags: ReturnType<typeof flattenReviewTags>;
  reviewerOnly?: boolean;
  periodCards: ReactNode;
  periods: ReviewPeriodOption[];
}) {
  const router = useRouter();
  const [activeRow, setActiveRow] = useState<VideoReviewRow | null>(
    () => data.rows.find((row) => row.id === searchParams.videoId) ?? null,
  );
  const [starting, setStarting] = useState(false);
  const [historyRow, setHistoryRow] = useState<VideoReviewRow | null>(null);
  const [notice, setNotice] = useState("");
  const [startError, setStartError] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  async function fetchNext(afterId?: string) {
    const params = new URLSearchParams();
    for (const key of ["q", "platform", "visibility", "from", "to"] as const) {
      const value = searchParams[key];
      if (value) params.set(key, value);
    }
    if (afterId) params.set("afterId", afterId);
    const response = await fetch(`/api/operator/video-reviews/next?${params}`, {
      cache: "no-store",
    });
    const result = (await response.json()) as {
      video: VideoReviewRow | null;
      error?: { message?: string };
    };
    if (!response.ok)
      throw new Error(result.error?.message ?? "待审视频加载失败，请重试");
    return result.video;
  }
  async function startReview() {
    setStarting(true);
    setStartError("");
    setNotice("");
    setSavedCount(0);
    try {
      const video = await fetchNext();
      setActiveRow(video);
      if (!video) {
        setNotice("当前筛选范围内没有待审核视频。");
        router.refresh();
      }
    } catch (error) {
      setStartError(
        error instanceof Error ? error.message : "网络错误，请重试",
      );
    } finally {
      setStarting(false);
    }
  }
  async function continueReview(afterId: string) {
    const video = await fetchNext(afterId);
    setActiveRow(video);
    if (!video) setNotice("已到达当前筛选范围的队列末尾。");
    router.refresh();
  }
  async function onSaved(video: VideoReviewRow, next: boolean) {
    setSavedCount((count) => count + 1);
    setActiveRow(video);
    try {
      if (next) await continueReview(video.id);
      else setActiveRow(null);
    } finally {
      router.refresh();
    }
  }
  function openRow(row: VideoReviewRow) {
    setSavedCount(0);
    setNotice("");
    setStartError("");
    setActiveRow(row);
  }
  function pageHref(page: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams))
      if (value !== undefined) params.set(key, String(value));
    params.set("page", String(page));
    return `/operator/submissions/review?${params}`;
  }
  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">稿件审核</h1>
          <p className="text-sm text-muted-foreground">
            {reviewerOnly ? "仅显示分配给你的稿件，记录审核状态与分级标签。" : "审核视频库中的作品，记录审核状态、审核员与分级标签。"}
          </p>
        </div>
        <Badge variant="outline">{reviewerOnly ? "我的分配" : "视频数据"}</Badge>
      </header>
      {periodCards}
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline gap-3">
                <h2 className="font-semibold">视频审核列表</h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  共 {data.total.toLocaleString("zh-CN")} 条
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {reviewerOnly ? "按发布时间从早到晚，连续处理当前筛选范围内的待审作品。" : "审核时间从新到旧，无审核时间的稿件置后；连续审核仍按发布时间处理待审作品。"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ReviewPeriodSelect periods={periods} />
              <Button
                variant="review-primary"
                size="lg"
                className="h-10 min-w-32 px-4"
                onClick={startReview}
                disabled={starting || data.pendingTotal === 0}
                data-start-review
              >
                {starting ? (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="motion-safe:animate-spin"
                  />
                ) : (
                  <Play data-icon="inline-start" />
                )}
                {starting ? "正在打开…" : "开始审核"}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
          {startError && (
            <p role="alert" className="text-sm text-destructive">
              {startError}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <CheckCheck className="size-4 text-sidebar-primary" />
              {notice}
              {savedCount > 0 && (
                <span className="text-muted-foreground">
                  本次已保存 {savedCount} 条。
                </span>
              )}
            </p>
          )}
          <SubmissionsFilters review video activities={[]} defaultStatus={reviewerOnly ? "PENDING" : "ALL"} />
        </CardHeader>
        <CardContent className="p-0">
          <VideoReviewTable
            key={`${JSON.stringify(searchParams)}:${data.rows.map((row) => row.id).join(",")}`}
            rows={data.rows}
            tags={tags}
            onReview={openRow}
            onHistory={reviewerOnly ? undefined : setHistoryRow}
          />
        </CardContent>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 text-xs text-muted-foreground">
          <span>
            第 {data.page} / {data.totalPages} 页 · 每页 {data.pageSize} 条
          </span>
          <div className="flex gap-2">
            {data.page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(data.page - 1)}>
                  <ChevronLeft data-icon="inline-start" />
                  上一页
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                <ChevronLeft data-icon="inline-start" />
                上一页
              </Button>
            )}
            {data.page < data.totalPages ? (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(data.page + 1)}>
                  下一页
                  <ChevronRight data-icon="inline-end" />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                下一页
                <ChevronRight data-icon="inline-end" />
              </Button>
            )}
          </div>
        </footer>
      </Card>
      {!reviewerOnly && historyRow && <VideoReviewHistoryDialog key={historyRow.id} row={historyRow} onClose={() => setHistoryRow(null)} />}
      <VideoReviewDialog
        row={activeRow}
        tags={tags}
        onClose={() => setActiveRow(null)}
        onSaved={onSaved}
        onContinue={continueReview}
        savedCount={savedCount}
      />
    </div>
  );
}
