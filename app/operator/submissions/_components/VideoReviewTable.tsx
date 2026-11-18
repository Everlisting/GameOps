"use client";

import { ChevronRight, FileSearch, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { shortVideoTitle, videoTagLevels } from "@/lib/video-review-display";
import type { VideoReviewRow } from "@/lib/video-reviews";
import type { flattenReviewTags } from "@/lib/review-tags";

export const videoReviewLabels = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "未通过",
} as const;
export const videoReviewVariants = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
} as const;

export default function VideoReviewTable({ rows, tags, onReview, onHistory }: {
  rows: VideoReviewRow[];
  tags: ReturnType<typeof flattenReviewTags>;
  onReview: (row: VideoReviewRow) => void;
  onHistory?: (row: VideoReviewRow) => void;
}) {
  return (
    <>
      <Table className={cn("table-fixed [&_td]:align-middle [&_th]:align-middle", onHistory ? "min-w-[1420px]" : "min-w-[1320px]")}>
        <colgroup>
          {/* 列宽集中设置；w-48 = 192px，也可直接写 w-[200px]。 */}
          <col className="w-52" /> {/* 作品ID：208px */}
          <col className="w-65" /> {/* 视频标题：260px */}
          <col className="w-24" /> {/* 审核按钮：96px */}
          <col className="w-36" /> {/* 发布时间：144px */}
          <col className="w-26" /> {/* 审核员：104px */}
          <col className="w-36" /> {/* 审核时间：144px */}
          <col className="w-26" /> {/* 审核状态：104px */}
          <col /> {/* 一级标签：分配剩余宽度，可增加 className 固定宽度 */}
          <col /> {/* 二级标签：分配剩余宽度 */}
          <col /> {/* 三级标签：分配剩余宽度 */}
          {onHistory && <col className="w-28" />} {/* 审核日志：112px */}
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">作品ID</TableHead>
            <TableHead>视频标题</TableHead>
            <TableHead>审核</TableHead>
            <TableHead>发布时间</TableHead>
            <TableHead>审核员</TableHead>
            <TableHead>审核时间</TableHead>
            <TableHead>审核状态</TableHead>
            <TableHead>一级标签</TableHead>
            <TableHead>二级标签</TableHead>
            <TableHead>三级标签</TableHead>
            {onHistory && <TableHead className="pr-5 text-right">审核日志</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="py-4 pl-5 text-xs tabular-nums">{row.externalId}</TableCell>
              <TableCell>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      className="block max-w-[15em] truncate rounded-sm text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-video-title
                    >
                      {shortVideoTitle(row.title)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm break-words">
                    {row.title}
                  </TooltipContent>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="review"
                  onClick={() => onReview(row)}
                  aria-label={`审核作品 ${row.externalId}`}
                  data-review-action
                >
                  审核
                  <ChevronRight
                    data-icon="inline-end"
                    aria-hidden="true"
                    className="opacity-60 transition-opacity duration-200 group-hover/button:opacity-100 motion-safe:transition-[translate,opacity] motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] motion-safe:group-hover/button:translate-x-0.5 motion-reduce:duration-100"
                  />
                </Button>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground tabular-nums">
                {row.publishedAt ? fmtDateTime(row.publishedAt) : "—"}
              </TableCell>
              <TableCell className="max-w-28">
                <span
                  title={row.reviewerName ?? undefined}
                  className="block truncate text-sm"
                >
                  {row.reviewerName ?? "—"}
                </span>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground tabular-nums">
                {row.reviewedAt ? fmtDateTime(row.reviewedAt) : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={videoReviewVariants[row.reviewStatus]}>
                  {videoReviewLabels[row.reviewStatus]}
                </Badge>
              </TableCell>
              {videoTagLevels(
                row.reviewTags.map((tag) => tag.id),
                tags,
              ).map((level, index) => (
                <TableCell key={index} className="max-w-32">
                  <div className="flex flex-col gap-1">
                    {level.length ? (
                      level.map((tag) => (
                        <span
                          key={tag.id}
                          title={tag.path}
                          className="truncate text-xs"
                        >
                          {tag.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
              ))}
              {onHistory && <TableCell className="pr-5 text-right"><Button size="sm" variant="ghost" onClick={() => onHistory(row)} aria-label={`查看作品 ${row.externalId} 的审核日志`}><History data-icon="inline-start" />审核日志</Button></TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!rows.length && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia>
              <FileSearch />
            </EmptyMedia>
            <EmptyTitle>没有符合条件的视频</EmptyTitle>
            <EmptyDescription>
              试试其他审核状态、作品 ID 或发布时间，或重置筛选查看待审核视频。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  );
}
