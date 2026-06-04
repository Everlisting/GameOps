"use client";

/**
 * 运营端稿件列表表格(含勾选 + 批量审核栏)。
 * 单条详情通过点击标题进入,不在表格内做内联编辑。
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReviewStatus, SubmissionStatus } from "@prisma/client";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmissionBadge } from "@/app/(creator)/_components/StatusBadge";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { ReviewPill } from "./StatusPill";
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
  createdAt: string; // ISO,因从 server 序列化过来
  creator: {
    id: string;
    nickname: string;
    dyName: string | null;
    dyAccount: string | null;
    ysId: string | null;
    groupNo: string | null;
  };
  activity: { id: string; name: string } | null;
};

type Field = "title" | "content" | "yishan";

export default function SubmissionsTable({ rows }: { rows: SubmissionRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [field, setField] = useState<Field>("title");
  const [status, setStatus] = useState<ReviewStatus>("APPROVED");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 当前打开审核弹窗的稿件 id;null = 关闭
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeRow = useMemo(
    () => (activeId ? rows.find((r) => r.id === activeId) ?? null : null),
    [activeId, rows],
  );

  const allChecked = useMemo(
    () => rows.length > 0 && rows.every((r) => selected.has(r.id)),
    [rows, selected],
  );
  const indeterminate = selected.size > 0 && !allChecked;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  async function submitBatch() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/operator/submissions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selected),
          field,
          status,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "批量审核失败");
        return;
      }
      setSelected(new Set());
      setNote("");
      router.refresh();
    } catch {
      setError("网络错误,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <Card className="sticky top-2 z-10 flex flex-wrap items-center gap-3 p-3">
          <span className="text-sm">
            已选 <strong className="text-primary">{selected.size}</strong> 条
          </span>
          <span className="text-xs text-muted-foreground">改</span>
          <Select value={field} onValueChange={(v) => setField(v as Field)}>
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="title">标题审核</SelectItem>
              <SelectItem value="content">内容审核</SelectItem>
              <SelectItem value="yishan">易闪审核</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">为</span>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as ReviewStatus)}
          >
            <SelectTrigger size="sm" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="APPROVED">通过</SelectItem>
              <SelectItem value="REJECTED">未通过</SelectItem>
              <SelectItem value="PENDING">待审核</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="备注(可选)"
            className="h-8 min-w-[180px] flex-1 text-xs"
          />
          <Button size="sm" onClick={submitBatch} disabled={submitting}>
            {submitting ? "提交中…" : "批量提交"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
          >
            清空
          </Button>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </Card>
      )}

      <ReviewDialog
        row={activeRow}
        open={!!activeRow}
        onOpenChange={(o) => {
          if (!o) setActiveId(null);
        }}
      />

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <Checkbox
                  checked={indeterminate ? "indeterminate" : allChecked}
                  onCheckedChange={toggleAll}
                  aria-label="全选"
                />
              </th>
              <th className="px-3 py-2.5 font-medium">稿件 / 创作者</th>
              <th className="px-3 py-2.5 font-medium">活动</th>
              <th className="px-3 py-2.5 font-medium">平台</th>
              <th className="px-3 py-2.5 font-medium">三子审核</th>
              <th className="px-3 py-2.5 font-medium">最终</th>
              <th className="px-3 py-2.5 font-medium">提交时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  没有符合条件的稿件。
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    "transition-colors hover:bg-muted/40",
                    selected.has(r.id) && "bg-primary/5",
                  )}
                >
                  <td className="px-3 py-2.5 align-top">
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={() => toggle(r.id)}
                      aria-label="选择此行"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setActiveId(r.id)}
                          className="text-left font-medium hover:text-primary"
                          title="打开审核弹窗"
                        >
                          <span className="line-clamp-1">{r.title}</span>
                        </button>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          @{r.creator.nickname}
                          {r.externalId && (
                            <span className="ml-2 font-mono text-[10px] opacity-70">
                              #{r.externalId}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground/80">
                          <CreatorInfo label="抖音昵称" value={r.creator.dyName} />
                          <CreatorInfo label="抖音号" value={r.creator.dyAccount} mono />
                          <CreatorInfo label="易闪" value={r.creator.ysId} mono />
                          <CreatorInfo label="团号" value={r.creator.groupNo} mono />
                        </div>
                      </div>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        title="打开原链接"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs text-muted-foreground">
                    {r.activity ? (
                      <Link
                        href={`/operator/activities/${r.activity.id}`}
                        className="hover:text-primary"
                      >
                        {r.activity.name}
                      </Link>
                    ) : (
                      <span className="opacity-50">未挂活动</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs">{r.platform}</td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="flex flex-wrap items-center gap-1">
                      <ReviewPill status={r.titleStatus} label="标" />
                      <ReviewPill status={r.contentStatus} label="内" />
                      <ReviewPill status={r.yishanStatus} label="易" />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <SubmissionBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs text-muted-foreground">
                    {fmtDateTime(new Date(r.createdAt))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/** 创作者基础信息条目;空值不渲染,避免拥挤 */
function CreatorInfo({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <span>
      {label}:
      <span className={cn("ml-0.5 text-foreground/70", mono && "font-mono")}>
        {value}
      </span>
    </span>
  );
}
