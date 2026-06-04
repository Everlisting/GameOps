"use client";

/**
 * 单条稿件的三子审核编辑器:三项独立保存。
 * 同时也支持"一键三连":整张稿件一次通过 / 一次驳回(填同一备注)。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Field = "title" | "content" | "yishan";

const STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING: "待审核",
  APPROVED: "通过",
  REJECTED: "未通过",
};

const STATUS_OPTIONS: ReviewStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export type SubReviewInitial = {
  id: string;
  title: { status: ReviewStatus; note: string };
  content: { status: ReviewStatus; note: string };
  yishan: { status: ReviewStatus; note: string };
};

export default function SubReviewForm({
  initial,
}: {
  initial: SubReviewInitial;
}) {
  const [state, setState] = useState(initial);

  function setField(f: Field, patch: Partial<SubReviewInitial[Field]>) {
    setState((s) => ({ ...s, [f]: { ...s[f], ...patch } }));
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <SubCard
        label="视频标题"
        helper="标题是否合规、是否与活动主题一致"
        field="title"
        value={state.title}
        onChange={(patch) => setField("title", patch)}
        id={initial.id}
      />
      <SubCard
        label="视频内容"
        helper="视频本身是否合规、内容质量"
        field="content"
        value={state.content}
        onChange={(patch) => setField("content", patch)}
        id={initial.id}
      />
      <SubCard
        label="易闪审核"
        helper="导入易闪结果或人工补录"
        field="yishan"
        value={state.yishan}
        onChange={(patch) => setField("yishan", patch)}
        id={initial.id}
      />
    </div>
  );
}

function SubCard({
  label,
  helper,
  field,
  value,
  onChange,
  id,
}: {
  label: string;
  helper: string;
  field: Field;
  value: { status: ReviewStatus; note: string };
  onChange: (patch: Partial<{ status: ReviewStatus; note: string }>) => void;
  id: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function save() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/operator/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [field]: { status: value.status, note: value.note || null },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "保存失败");
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
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="text-sm font-medium">{label}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange({ status: s })}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              value.status === s
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

      <div>
        <Label className="mb-1 block text-xs">备注</Label>
        <Textarea
          rows={3}
          value={value.note}
          onChange={(e) => onChange({ note: e.target.value })}
          maxLength={1000}
          placeholder="可选,运营内部备注"
          className="text-xs"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {error
            ? null
            : savedAt && Date.now() - savedAt < 4000
              ? "已保存"
              : ""}
        </span>
        <Button size="sm" onClick={save} disabled={submitting}>
          {submitting ? "保存中…" : "保存"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </Card>
  );
}
