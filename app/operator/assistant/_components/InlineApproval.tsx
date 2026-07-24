"use client";

/**
 * 阶段10.4 · 对话内内联审批卡片(固定格式)。
 * pending 展示完整字段 + 批准/拒绝 + 60s 倒计时(超时自动判拒);
 * 决策后原地按同一格式回填「已完成 / 已拒绝 / 失败」。
 * 决策走 /assistant/approvals/[id]/decision(后端幂等原子领取)。
 */
import * as React from "react";
import { Loader2, ShieldAlert, Check, X, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";

const TIMEOUT_SECONDS = 60;

interface ApprovalView {
  id: string;
  title: string;
  preview: unknown;
  status: string;
  result: unknown;
  errorMessage: string | null;
}

function pick(obj: unknown, key: string): unknown {
  return obj && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined;
}
function str(obj: unknown, key: string): string {
  const v = pick(obj, key);
  return v == null || v === "" ? "—" : String(v);
}

/** 一行「标签:值」。值用等宽以对齐 ID。 */
function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-muted-foreground">{label}：</span>
      <span className={mono ? "break-all font-mono text-xs" : "break-all"}>{value}</span>
    </div>
  );
}

export function InlineApproval({
  approvalId,
  title,
  preview,
}: {
  approvalId: string;
  title?: string;
  preview?: unknown;
}) {
  const [status, setStatus] = React.useState<string>("loading");
  const [titleState, setTitleState] = React.useState(title ?? "");
  const [previewState, setPreviewState] = React.useState<unknown>(preview ?? null);
  const [result, setResult] = React.useState<unknown>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [left, setLeft] = React.useState(TIMEOUT_SECONDS);
  const [timedOut, setTimedOut] = React.useState(false);
  const decidedRef = React.useRef(false);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/operator/assistant/approvals/${approvalId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { approval: ApprovalView & { title?: string } };
      setStatus(data.approval.status);
      setResult(data.approval.result);
      setErrorMsg(data.approval.errorMessage);
      if (typeof data.approval.title === "string") setTitleState(data.approval.title);
      if (data.approval.preview != null) setPreviewState(data.approval.preview);
      if (data.approval.status !== "pending") decidedRef.current = true;
    } catch {
      /* ignore */
    }
  }, [approvalId]);

  const decide = React.useCallback(
    async (decision: "approve" | "reject", auto = false) => {
      if (decidedRef.current) return;
      decidedRef.current = true;
      setBusy(true);
      if (auto) setTimedOut(true);
      try {
        const res = await fetch(`/api/operator/assistant/approvals/${approvalId}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        });
        const data = (await res.json().catch(() => null)) as
          | { ok: boolean; error?: string; approval?: ApprovalView | null }
          | null;
        if (data?.approval) {
          setStatus(data.approval.status);
          setResult(data.approval.result);
          setErrorMsg(data.approval.errorMessage ?? data.error ?? null);
        } else if (res.status === 409) {
          void refresh();
        } else {
          setStatus("failed");
          setErrorMsg(data?.error ?? "操作失败");
        }
      } catch {
        setStatus("failed");
        setErrorMsg("网络错误");
      } finally {
        setBusy(false);
      }
    },
    [approvalId, refresh],
  );

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (status !== "pending") return;
    if (left <= 0) {
      void decide("reject", true);
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [status, left, decide]);

  const box =
    "mt-1 rounded-lg border p-3.5 text-sm leading-relaxed duration-300 animate-in fade-in slide-in-from-bottom-1";

  if (status === "loading") {
    return (
      <div className={`${box} bg-muted/30 text-muted-foreground`}>
        <Loader2 className="inline size-3.5 animate-spin" /> 读取审批状态…
      </div>
    );
  }

  const activityName = str(previewState,"activityName");

  // ── 已完成 ──
  if (status === "executed") {
    return (
      <div className={`${box} border-emerald-500/40 bg-emerald-500/10`}>
        <div className="mb-2 flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-200">
          <Check className="size-4" /> 重算已完成
        </div>
        <div className="space-y-0.5">
          <Row label="审批ID" value={approvalId} mono />
          <Row label="状态" value="已完成（executed）" />
          <Row label="活动名称" value={str(result, "activityName")} />
          <Row label="规则数" value={`${str(result, "rulesCount")}条`} />
          <Row label="参与人数" value={`${str(result, "creatorsCount")}人`} />
          <Row label="预估合计" value={`¥${str(result, "totalEstimated")}`} />
          <Row label="用时" value={`${str(result, "durationMs")}ms`} />
        </div>
      </div>
    );
  }

  // ── 已拒绝 ──
  if (status === "rejected") {
    return (
      <div className={`${box} border-muted bg-muted/40 text-muted-foreground`}>
        <div className="mb-2 flex items-center gap-1.5 font-medium">
          <X className="size-4" /> 操作已拒绝
        </div>
        <div className="space-y-0.5">
          <Row label="审批ID" value={approvalId} mono />
          <Row label="状态" value={timedOut ? "已拒绝（超时未审批,自动拒绝）" : "已拒绝（rejected）"} />
          <Row label="活动名称" value={activityName} />
        </div>
      </div>
    );
  }

  // ── 失败 ──
  if (status === "failed") {
    return (
      <div className={`${box} border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-200`}>
        <div className="mb-2 flex items-center gap-1.5 font-medium">
          <X className="size-4" /> 执行失败
        </div>
        <div className="space-y-0.5">
          <Row label="审批ID" value={approvalId} mono />
          <Row label="状态" value="失败（failed）" />
          <Row label="原因" value={errorMsg ?? "未知错误"} />
        </div>
      </div>
    );
  }

  // ── 待审批 ──
  return (
    <div className={`${box} border-amber-500/50 bg-amber-500/5`}>
      <div className="mb-2 flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-200">
        <ShieldAlert className="size-4" /> 已为您提交「{titleState || "重算预估激励"}」的操作
      </div>
      <div className="mb-1 font-medium">当前状态</div>
      <div className="space-y-0.5">
        <Row label="审批ID" value={approvalId} mono />
        <Row label="状态" value="待审批（pending）" />
        <Row label="活动名称" value={activityName} />
        <Row label="活动ID" value={str(previewState,"activityId")} mono />
        <Row label="规则数" value={`${str(previewState,"rulesCount")}条`} />
        <Row label="稿件数" value={`${str(previewState,"submissionsCount")}条`} />
        <Row label="参与人数" value={`${str(previewState,"candidateCount")}人`} />
        <Row label="计算范围" value={str(previewState,"scope")} />
      </div>
      <div className="mb-1 mt-2.5 font-medium">下一步</div>
      <p className="text-muted-foreground">
        点击下方「批准」后,系统才会真正执行重算;批准后将{str(previewState,"effect")}。
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <Button size="sm" onClick={() => decide("approve")} disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          批准
        </Button>
        <Button size="sm" variant="outline" onClick={() => decide("reject")} disabled={busy}>
          <X className="size-3.5" />
          拒绝
        </Button>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <Clock className="size-3.5" />
          {left}s 后自动拒绝
        </span>
      </div>
    </div>
  );
}
