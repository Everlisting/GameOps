"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import type { ReviewStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmissionBadge } from "@/app/(creator)/_components/StatusBadge";
import { fmtDateTime } from "@/lib/format";
import {
  platformLabel,
  reviewLabels,
  type SubmissionRow,
  type TagOption,
} from "./SubmissionsTable";

export default function ReviewDialog({
  row,
  tags,
  onClose,
}: {
  row: SubmissionRow | null;
  tags: TagOption[];
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!row}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[92dvh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto">
        {row && (
          <ReviewBody key={row.id} row={row} tags={tags} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewBody({
  row,
  tags,
  onClose,
}: {
  row: SubmissionRow;
  tags: TagOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    title: { status: row.titleStatus, note: row.titleNote ?? "" },
    content: { status: row.contentStatus, note: row.contentNote ?? "" },
    yishan: { status: row.yishanStatus, note: row.yishanNote ?? "" },
  });
  const [tagIds, setTagIds] = useState(row.reviewTags.map((tag) => tag.id));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [embed, setEmbed] = useState("");
  useEffect(() => {
    const vid = row.externalId ?? /\/video\/(\d+)/.exec(row.url)?.[1];
    const isDouyin = /抖音|douyin/i.test(row.platform);
    if (!isDouyin || !vid) {
      setEmbed(row.url);
      return;
    }
    const controller = new AbortController();
    const fallback = `https://open.douyin.com/player/video?vid=${encodeURIComponent(vid)}&autoplay=0`;
    fetch(`/api/operator/submissions/embed?vid=${encodeURIComponent(vid)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => setEmbed(data.url || data.fallback || fallback))
      .catch(() => {
        if (!controller.signal.aborted) setEmbed(fallback);
      });
    return () => controller.abort();
  }, [row.id, row.url, row.externalId, row.platform]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/operator/submissions/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: { ...values.title, note: values.title.note.trim() || null },
          content: {
            ...values.content,
            note: values.content.note.trim() || null,
          },
          yishan: { ...values.yishan, note: values.yishan.note.trim() || null },
          tagIds,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message ?? "保存失败");
      router.refresh();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "网络错误，请重试");
    } finally {
      setBusy(false);
    }
  }
  const selectable = tags.filter(
    (tag) => tag.available || tagIds.includes(tag.id),
  );
  return (
    <>
      <DialogHeader className="pr-7">
        <DialogTitle>{row.title}</DialogTitle>
        <DialogDescription>
          {platformLabel(row.platform)} · {row.activity?.name ?? "未关联活动"} ·{" "}
          {fmtDateTime(row.createdAt)}
        </DialogDescription>
      </DialogHeader>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">稿件预览</h3>
            <Button asChild variant="outline" size="sm">
              <a href={row.url} target="_blank" rel="noreferrer">
                打开原稿
                <ExternalLink data-icon="inline-end" />
              </a>
            </Button>
          </div>
          <div className="flex min-h-72 items-center justify-center overflow-hidden rounded-lg border bg-muted lg:min-h-[480px]">
            {embed ? (
              <iframe
                title={`预览：${row.title}`}
                src={embed}
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                allow="fullscreen; autoplay"
                allowFullScreen
                className="h-[480px] w-full"
              />
            ) : (
              <p className="text-sm text-muted-foreground">正在载入预览…</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            预览受平台限制时，可打开原稿查看完整内容。
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <FieldGroup>
            {(["title", "content", "yishan"] as const).map((key) => (
              <Field key={key}>
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel htmlFor={`review-${key}`}>
                    {
                      {
                        title: "标题审核",
                        content: "内容审核",
                        yishan: "易闪审核",
                      }[key]
                    }
                  </FieldLabel>
                  <Select
                    value={values[key].status}
                    disabled={busy}
                    onValueChange={(status) =>
                      setValues((old) => ({
                        ...old,
                        [key]: { ...old[key], status: status as ReviewStatus },
                      }))
                    }
                  >
                    <SelectTrigger
                      className="w-28"
                      aria-label={`${{ title: "标题", content: "内容", yishan: "易闪" }[key]}审核结果`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {Object.entries(reviewLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  id={`review-${key}`}
                  disabled={busy}
                  maxLength={1000}
                  rows={2}
                  value={values[key].note}
                  placeholder="审核备注（可选）"
                  onChange={(event) =>
                    setValues((old) => ({
                      ...old,
                      [key]: { ...old[key], note: event.target.value },
                    }))
                  }
                />
              </Field>
            ))}
          </FieldGroup>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-sm font-medium">
              审核标签（{tagIds.length} / 30）
            </legend>
            {!selectable.length && (
              <p className="text-xs text-muted-foreground">
                暂无可用标签，运营可在「审核标签」中创建。
              </p>
            )}
            <div className="flex max-h-44 flex-col gap-3 overflow-y-auto">
              {selectable.map((tag) => (
                <Field key={tag.id} orientation="horizontal">
                  <Checkbox
                    id={`tag-${tag.id}`}
                    checked={tagIds.includes(tag.id)}
                    disabled={
                      busy ||
                      (!tagIds.includes(tag.id) &&
                        (!tag.available || tagIds.length >= 30))
                    }
                    onCheckedChange={(checked) =>
                      setTagIds((old) =>
                        checked
                          ? [...old, tag.id]
                          : old.filter((id) => id !== tag.id),
                      )
                    }
                  />
                  <FieldLabel htmlFor={`tag-${tag.id}`} className="font-normal">
                    {tag.path}
                    {!tag.available && <Badge variant="muted">已停用</Badge>}
                  </FieldLabel>
                </Field>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          当前结果
          <SubmissionBadge status={row.status} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button disabled={busy || tagIds.length > 30} onClick={save}>
            {busy ? "正在保存…" : "保存审核"}
          </Button>
        </div>
      </div>
    </>
  );
}
