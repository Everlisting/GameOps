"use client";

import { useEffect, useState } from "react";
import type { ReviewStatus } from "@prisma/client";
import { ArrowRight, ExternalLink, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime } from "@/lib/format";
import type { VideoReviewRow } from "@/lib/video-reviews";
import type { flattenReviewTags } from "@/lib/review-tags";
import {
  changeReviewTagSelection,
  initialReviewTagSelection,
  selectedReviewTagIds,
} from "@/lib/review-tag-selection";
import { responsiveVideoEmbedUrl } from "@/lib/video-review-display";
import { validateVideoReview } from "@/lib/video-review-validation";
import { videoReviewLabels, videoReviewVariants } from "./VideoReviewTable";
import styles from "./VideoReviewDialog.module.css";
import { cn } from "@/lib/utils";

type Props = {
  row: VideoReviewRow;
  tags: ReturnType<typeof flattenReviewTags>;
  onClose: () => void;
  onSaved: (video: VideoReviewRow, next: boolean) => Promise<void>;
  onContinue: (afterId: string) => Promise<void>;
  savedCount: number;
};
export default function VideoReviewDialog({
  row,
  tags,
  onClose,
  onSaved,
  onContinue,
  savedCount,
}: Omit<Props, "row"> & { row: VideoReviewRow | null }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={!!row}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className={cn(styles.dialog, "flex h-[min(820px,92dvh)] max-h-[92dvh] w-[calc(100%-2rem)] max-w-5xl flex-col gap-0 overflow-hidden bg-card p-0 text-card-foreground sm:p-0")}>
        {row && (
          <VideoReviewBody
            key={row.id}
            row={row}
            tags={tags}
            onClose={onClose}
            onSaved={onSaved}
            onContinue={onContinue}
            savedCount={savedCount}
            onBusyChange={setBusy}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
function VideoReviewBody({
  row,
  tags,
  onClose,
  onSaved,
  onContinue,
  savedCount,
  onBusyChange,
}: Props & { onBusyChange: (busy: boolean) => void }) {
  const [status, setStatus] = useState<ReviewStatus>(row.reviewStatus),
    [note, setNote] = useState(row.reviewNote ?? "");
  const originalTagIds = row.reviewTags.map((tag) => tag.id);
  const [tagSelection, setTagSelection] = useState(() =>
    initialReviewTagSelection(originalTagIds, tags),
  );
  const [tagsChanged, setTagsChanged] = useState(false);
  const tagIds = tagsChanged
    ? selectedReviewTagIds(tagSelection)
    : originalTagIds;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const validation = validateVideoReview(status, tagIds, tags);
  const statusError = validationAttempted ? validation.status : undefined;
  const tagError = validationAttempted ? validation.tag : undefined;
  const locked = busy || saved;
  const [embed, setEmbed] = useState("");
  useEffect(() => {
    if (!/抖音|douyin/i.test(row.platform)) {
      setEmbed(row.url);
      return;
    }
    const controller = new AbortController();
    const fallback = `https://open.douyin.com/player/video?vid=${encodeURIComponent(row.externalId)}&autoplay=0`;
    fetch(
      `/api/operator/submissions/embed?vid=${encodeURIComponent(row.externalId)}`,
      { signal: controller.signal },
    )
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (!controller.signal.aborted)
          setEmbed(data.url || data.fallback || fallback);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEmbed(fallback);
      });
    return () => controller.abort();
  }, [row.platform, row.url, row.externalId]);
  async function save(next: boolean) {
    if (busy) return;
    if (!saved && (validation.status || validation.tag)) {
      setValidationAttempted(true);
      setError("");
      const targetId = validation.status
        ? "video-review-status"
        : `video-review-tag-${validation.tag?.level ?? 0}`;
      const target = document.getElementById(targetId);
      (target instanceof HTMLButtonElement && !target.disabled
        ? target
        : document.getElementById("video-review-tag-0"))?.focus();
      requestAnimationFrame(() => {
        document.getElementById(
          validation.status ? "video-review-status-error" : "video-review-tag-error",
        )?.scrollIntoView({ block: "nearest" });
      });
      return;
    }
    setBusy(true);
    onBusyChange(true);
    setError("");
    let didSave = saved;
    try {
      if (saved) {
        if (next) await onContinue(row.id);
        else onClose();
        return;
      }
      const response = await fetch(`/api/operator/video-reviews/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: note.trim() || null, tagIds }),
      });
      const data = (await response.json()) as VideoReviewRow & {
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(data?.error?.message ?? "审核保存失败");
      setSaved(true);
      didSave = true;
      await onSaved(data, next);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "网络错误，请重试";
      setError(
        didSave
          ? `审核已保存，下一条加载失败：${message}。可重试下一条或关闭。`
          : message,
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  const hasOtherHistoricalTags = originalTagIds.some(
    (id) => !tagSelection.includes(id),
  );
  return (
    <>
      <DialogHeader className="shrink-0 px-5 py-5 pr-12">
        <DialogTitle className="line-clamp-2 break-words" title={row.title}>
          {row.title}
        </DialogTitle>
        <DialogDescription>
          作品 ID {row.externalId} · 发布时间{" "}
          {row.publishedAt ? fmtDateTime(row.publishedAt) : "未知"}
        </DialogDescription>
        <p className="text-xs text-muted-foreground">
          本次已保存 <span className="tabular-nums">{savedCount}</span> 条 ·
          按发布时间从早到晚连续审核
        </p>
      </DialogHeader>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-5 pb-5"
        data-review-scroll
      >
        <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div
              className="flex h-[min(600px,calc(92dvh_-_244px))] min-h-[220px] justify-center"
              data-video-stage
            >
              <div
                className="relative aspect-[9/16] h-full max-w-full overflow-hidden rounded-xl bg-black"
                data-video-frame
              >
                {embed ? (
                  <iframe
                    title={`视频预览：${row.title}`}
                    src={responsiveVideoEmbedUrl(embed)}
                    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                    allow="fullscreen; autoplay"
                    allowFullScreen
                    scrolling="no"
                    className="absolute inset-0 h-full w-full border-0"
                  />
                ) : (
                  <p className="flex h-full items-center justify-center text-sm text-white/80">
                    正在载入预览…
                  </p>
                )}
              </div>
            </div>
          </div>
          <FieldGroup>
            <Field data-invalid={!!statusError}>
              <FieldLabel htmlFor="video-review-status">审核状态</FieldLabel>
              <Select
                value={status}
                disabled={locked}
                onValueChange={(value) => setStatus(value as ReviewStatus)}
              >
                <SelectTrigger
                  id="video-review-status"
                  className={cn(styles.control, "disabled:text-muted-foreground disabled:opacity-100")}
                  aria-invalid={!!statusError}
                  aria-describedby={
                    statusError ? "video-review-status-error" : undefined
                  }
                  aria-required
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={styles.selectContent}>
                  <SelectGroup>
                    {Object.entries(videoReviewLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {statusError && (
                <FieldError id="video-review-status-error">
                  {statusError}
                </FieldError>
              )}
            </Field>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-sm font-medium">审核标签</legend>
              {!tags.some((tag) => tag.available) && (
                <p className="text-xs text-muted-foreground">
                  暂无可用标签，运营可在「审核标签」中创建。
                </p>
              )}
              <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                {["一级标签", "二级标签", "三级标签"].map((label, level) => {
                  const parentId = level === 0 ? null : tagSelection[level - 1];
                  const parent = tags.find((tag) => tag.id === parentId);
                  const options = tags.filter(
                    (tag) =>
                      tag.parentId === parentId &&
                      tag.depth === level &&
                      (tag.available || tag.id === tagSelection[level]),
                  );
                  const disabled =
                    locked ||
                    (level > 0 && (!parentId || !parent?.available)) ||
                    !options.length;
                  return (
                    <Field
                      key={label}
                      className="min-w-0 gap-2"
                      data-invalid={tagError?.level === level}
                    >
                      <FieldLabel
                        htmlFor={`video-review-tag-${level}`}
                        className="text-xs font-normal text-muted-foreground"
                      >
                        {label}
                      </FieldLabel>
                      <Select
                        value={tagSelection[level] ?? "__none__"}
                        disabled={disabled}
                        onValueChange={(value) => {
                          setTagSelection((old) =>
                            changeReviewTagSelection(
                              old,
                              level,
                              value === "__none__" ? null : value,
                            ),
                          );
                          setTagsChanged(true);
                        }}
                      >
                        <SelectTrigger
                          id={`video-review-tag-${level}`}
                          className={cn(styles.control, "w-full min-w-0 disabled:text-muted-foreground disabled:opacity-100")}
                          aria-invalid={tagError?.level === level}
                          aria-describedby={
                            tagError?.level === level
                              ? "video-review-tag-error"
                              : undefined
                          }
                          aria-required={!disabled}
                        >
                          <SelectValue className="truncate" />
                        </SelectTrigger>
                        <SelectContent className={styles.selectContent}>
                          <SelectGroup>
                            <SelectItem value="__none__">
                              {level > 0 && !parentId
                                ? `先选${level === 1 ? "一级" : "二级"}标签`
                                : options.length
                                  ? "请选择"
                                  : "暂无下级标签"}
                            </SelectItem>
                            {options.map((tag) => (
                              <SelectItem
                                key={tag.id}
                                value={tag.id}
                                disabled={!tag.available}
                              >
                                {tag.name}
                                {!tag.available ? "（已停用）" : ""}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  );
                })}
              </div>
              {tagError && (
                <FieldError id="video-review-tag-error">
                  {tagError.message}
                </FieldError>
              )}
              <p className="text-xs text-muted-foreground">
                请选择当前分支的末级标签，没有下级时无需继续选择。
                {!tagsChanged &&
                  hasOtherHistoricalTags &&
                  " 当前含其他历史标签，修改选择后将替换为此路径。"}
              </p>
            </fieldset>
            <Field>
              <FieldLabel htmlFor="video-review-note">审核备注</FieldLabel>
              <Textarea
                id="video-review-note"
                className={cn(styles.control, "disabled:text-muted-foreground disabled:opacity-100")}
                disabled={locked}
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="说明审核依据（可选）"
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              当前审核员：{row.reviewerName ?? "尚未审核"}
              {row.reviewedAt ? ` · ${fmtDateTime(row.reviewedAt)}` : ""}
              。保存时记录为本次操作人。
            </p>
          </FieldGroup>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div
        className="flex shrink-0 flex-col gap-3 border-t bg-background px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
        data-review-footer
      >
        <div className="flex items-center gap-3">
          <Badge variant={videoReviewVariants[status]}>
            {videoReviewLabels[status]}
          </Badge>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            关闭
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={row.url} target="_blank" rel="noreferrer">
              打开原视频
              <ExternalLink data-icon="inline-end" />
            </a>
          </Button>
        </div>
        <div className="flex flex-col gap-2 min-[380px]:flex-row sm:items-center">
          <Button
            variant="outline"
            className={cn(styles.secondaryAction, "h-10")}
            disabled={busy}
            onClick={() => save(false)}
          >
            {saved ? "关闭" : "保存并关闭"}
          </Button>
          <Button
            variant="review-primary"
            className="h-10 px-4"
            disabled={busy}
            onClick={() => save(true)}
            data-save-next
          >
            {busy && (
              <LoaderCircle
                data-icon="inline-start"
                className="motion-safe:animate-spin"
              />
            )}
            {busy ? "正在处理…" : saved ? "重试下一条" : "保存并审核下一条"}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </>
  );
}
