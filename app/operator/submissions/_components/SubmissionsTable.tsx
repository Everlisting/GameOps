"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileSearch } from "lucide-react";
import type { ReviewStatus, SubmissionStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubmissionBadge } from "@/app/(creator)/_components/StatusBadge";
import { fmtDateTime } from "@/lib/format";
import type { flattenReviewTags } from "@/lib/review-tags";
import { cn } from "@/lib/utils";
import ReviewDialog from "./ReviewDialog";

export type SubmissionRow = {
  id: string;
  title: string;
  url: string;
  platform: string;
  externalId: string | null;
  status: SubmissionStatus;
  titleStatus: ReviewStatus;
  titleNote: string | null;
  contentStatus: ReviewStatus;
  contentNote: string | null;
  yishanStatus: ReviewStatus;
  yishanNote: string | null;
  createdAt: string;
  views: number | null;
  activity: { id: string; name: string } | null;
  reviewTags: { id: string; name: string }[];
};
export type TagOption = ReturnType<typeof flattenReviewTags>[number];
const fields = { title: "标题", content: "内容", yishan: "易闪" } as const;
export const reviewLabels = {
  PENDING: "待审核",
  APPROVED: "通过",
  REJECTED: "未通过",
} as const;
export const reviewVariants = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
} as const;
export function platformLabel(platform: string) {
  return (
    (
      { douyin: "抖音", bilibili: "哔哩哔哩", xiaohongshu: "小红书" } as Record<
        string,
        string
      >
    )[platform] ?? platform
  );
}

export default function SubmissionsTable({
  rows,
  review = false,
  tags = [],
  initialId,
}: {
  rows: SubmissionRow[];
  review?: boolean;
  tags?: TagOption[];
  initialId?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(initialId ?? null);
  const [field, setField] = useState<keyof typeof fields>("title");
  const [status, setStatus] = useState<ReviewStatus>("APPROVED");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const all = rows.length > 0 && rows.every((row) => selected.has(row.id));
  function toggle(id: string) {
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function batch() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/operator/submissions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [...selected],
          field,
          status,
          note: note.trim() || undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result?.error?.message ?? "批量审核失败");
      setSelected(new Set());
      setNote("");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "网络错误，请重试");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {review && selected.size > 0 && (
        <div className="flex flex-col gap-3 border-y bg-muted/40 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">已选择 {selected.size} 条稿件</p>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setSelected(new Set())}
            >
              取消选择
            </Button>
          </div>
          <FieldGroup className="gap-3 sm:flex-row sm:items-end">
            <Field className="sm:w-36">
              <FieldLabel htmlFor="batch-field">审核环节</FieldLabel>
              <Select
                value={field}
                disabled={busy}
                onValueChange={(value) =>
                  setField(value as keyof typeof fields)
                }
              >
                <SelectTrigger id="batch-field">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(fields).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}审核
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field className="sm:w-32">
              <FieldLabel htmlFor="batch-status">审核结果</FieldLabel>
              <Select
                value={status}
                disabled={busy}
                onValueChange={(value) => setStatus(value as ReviewStatus)}
              >
                <SelectTrigger id="batch-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(reviewLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field className="flex-1">
              <FieldLabel htmlFor="batch-note">审核备注（可选）</FieldLabel>
              <Input
                id="batch-note"
                value={note}
                disabled={busy}
                maxLength={1000}
                onChange={(event) => setNote(event.target.value)}
                placeholder="填写本次批量审核的说明"
              />
            </Field>
            <Button disabled={busy} onClick={batch}>
              {busy ? "正在提交…" : "提交批量审核"}
            </Button>
          </FieldGroup>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
      <Table className={review ? "min-w-[880px]" : "min-w-[720px]"}>
        <TableHeader>
          <TableRow>
            {review && (
              <TableHead className="w-12 pl-5">
                <Checkbox
                  disabled={busy || !rows.length}
                  checked={all ? true : selected.size ? "indeterminate" : false}
                  onCheckedChange={() =>
                    setSelected(
                      all ? new Set() : new Set(rows.map((row) => row.id)),
                    )
                  }
                  aria-label="选择本页全部稿件"
                />
              </TableHead>
            )}
            <TableHead className={cn("w-[38%]", !review && "pl-5")}>
              稿件信息
            </TableHead>
            <TableHead>所属活动</TableHead>
            {!review && <TableHead className="text-right">播放量</TableHead>}
            {review && <TableHead>审核进度</TableHead>}
            <TableHead>审核结果</TableHead>
            <TableHead className="pr-5">投稿时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={selected.has(row.id) ? "selected" : undefined}
            >
              {review && (
                <TableCell className="pl-5">
                  <Checkbox
                    disabled={busy}
                    checked={selected.has(row.id)}
                    onCheckedChange={() => toggle(row.id)}
                    aria-label={`选择稿件：${row.title}`}
                  />
                </TableCell>
              )}
              <TableCell className={cn("py-5", !review && "pl-5")}>
                <div className="flex flex-col gap-2">
                  {review ? (
                    <button
                      type="button"
                      onClick={() => setActiveId(row.id)}
                      className="line-clamp-2 text-left font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {row.title}
                    </button>
                  ) : (
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noreferrer"
                      className="line-clamp-2 font-medium underline-offset-4 hover:underline"
                    >
                      {row.title}
                    </a>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">
                      {platformLabel(row.platform)}
                    </Badge>
                    {row.externalId && (
                      <span className="break-all tabular-nums">
                        ID {row.externalId}
                      </span>
                    )}
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`打开原稿：${row.title}`}
                      className="rounded-sm p-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                  {review && !!row.reviewTags.length && (
                    <div className="flex flex-wrap gap-1">
                      {row.reviewTags.map((tag) => (
                        <Badge key={tag.id} variant="outline">
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell className="max-w-48 whitespace-normal text-xs text-muted-foreground">
                {row.activity?.name ?? "未关联活动"}
              </TableCell>
              {!review && (
                <TableCell className="text-right font-medium tabular-nums">
                  {row.views === null ? "—" : row.views.toLocaleString("zh-CN")}
                </TableCell>
              )}
              {review && (
                <TableCell>
                  <div className="flex flex-col items-start gap-1.5">
                    {Object.entries(fields).map(([key, label]) => {
                      const value =
                        row[
                          `${key}Status` as
                            "titleStatus" | "contentStatus" | "yishanStatus"
                        ];
                      return (
                        <Badge key={key} variant={reviewVariants[value]}>
                          {label} · {reviewLabels[value]}
                        </Badge>
                      );
                    })}
                  </div>
                </TableCell>
              )}
              <TableCell>
                <SubmissionBadge status={row.status} />
              </TableCell>
              <TableCell className="pr-5 text-xs text-muted-foreground tabular-nums">
                {fmtDateTime(row.createdAt)}
              </TableCell>
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
            <EmptyTitle>没有找到符合条件的稿件</EmptyTitle>
            <EmptyDescription>
              {review
                ? "可以切换审核结果查看已处理稿件，或调整活动与日期范围。"
                : "试试其他关键词，或重置筛选查看全部稿件。"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {review && (
        <ReviewDialog
          row={rows.find((row) => row.id === activeId) ?? null}
          tags={tags}
          onClose={() => setActiveId(null)}
        />
      )}
    </>
  );
}
