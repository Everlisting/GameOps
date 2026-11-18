"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Shuffle, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reviewAssignmentResultSchema, reviewAssignmentPlanSchema } from "@/lib/validation/review-assignment";
import type { z } from "zod";
import type { PeriodAssignmentOverview } from "@/lib/review-assignments";
import ReviewAssignmentGroupEditor, { draftGroupTotal, type AssignmentDraftGroup } from "./ReviewAssignmentGroupEditor";
import ReviewAssignmentPreview from "./ReviewAssignmentPreview";

function emptyGroup(id: string): AssignmentDraftGroup { return { id, mode: "EVEN", totalCount: "", selected: [], counts: {} }; }

export default function ReviewAssignmentPanel({ periodId, overview }: { periodId: string; overview: PeriodAssignmentOverview }) {
  const router = useRouter();
  const nextGroupId = useRef(2);
  const [drafts, setDrafts] = useState<AssignmentDraftGroup[]>([emptyGroup("g1")]);
  const [preview, setPreview] = useState<{ key: string; input: z.infer<typeof reviewAssignmentPlanSchema> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = overview.reviewers.filter((row) => row.active);
  const groups = drafts.map((group) => ({ mode: group.mode, ...(group.mode === "EVEN" ? { totalCount: Number(group.totalCount || 0) } : {}), recipients: group.selected.map((reviewerId) => ({ reviewerId, ...(group.mode === "QUOTA" ? { count: Number(group.counts[reviewerId] || 0) } : {}) })) }));
  const key = JSON.stringify({ groups, eligible: overview.eligible });
  const total = drafts.reduce((sum, group) => sum + draftGroupTotal(group), 0);
  const ready = preview?.key === key;
  function change() { setPreview(null); setError(""); setNotice(""); }
  function addGroup() { const group = emptyGroup(`g${nextGroupId.current++}`); setDrafts((old) => [...old, group]); change(); }
  function showPreview() {
    setError(""); setNotice("");
    const parsed = reviewAssignmentPlanSchema.safeParse({ requestId: crypto.randomUUID(), expectedEligibleCount: overview.eligible, groups });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const groupIndex = typeof issue?.path[1] === "number" ? issue.path[1] : null;
      setError(`${groupIndex !== null ? `第${groupIndex + 1}组：` : ""}${issue?.message ?? "请检查分配配置。"}`);
      if (groupIndex !== null && issue.path.includes("totalCount")) document.getElementById(`allocation-total-${drafts[groupIndex].id}`)?.focus();
      return;
    }
    if (!overview.eligible) { setError("当前没有可分配稿件。"); return; }
    setPreview({ key, input: parsed.data });
  }
  async function assign() {
    if (!ready || !preview || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/operator/submission-periods/${periodId}/assignments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preview.input) });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) { setPreview(null); router.refresh(); }
        const message = typeof data === "object" && data && "error" in data && typeof data.error === "object" && data.error && "message" in data.error && typeof data.error.message === "string" ? data.error.message : "分配失败，请重试。";
        throw new Error(message);
      }
      const result = reviewAssignmentResultSchema.parse(data);
      setNotice(`已分配 ${result.assigned.toLocaleString("zh-CN")} 条稿件，剩余 ${result.remaining.toLocaleString("zh-CN")} 条待分配。`);
      setPreview(null); setDrafts([emptyGroup(`g${nextGroupId.current++}`)]); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "网络错误，请重试。"); }
    finally { setBusy(false); }
  }
  const safeTotal = Number.isSafeInteger(total) && total >= 0 ? total : 0;
  return <Card className="min-w-0 overflow-hidden shadow-none">
    <CardHeader className="gap-2"><CardTitle>审核分配</CardTitle><CardDescription>仅分配本周期内待审核且尚未分配的有效稿件，保留已有分配和审核结果。</CardDescription></CardHeader>
    <CardContent className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">可分配 <strong className="font-semibold text-foreground tabular-nums">{overview.eligible.toLocaleString("zh-CN")}</strong> 条 · 本周期已分配 <span className="tabular-nums">{overview.assigned.toLocaleString("zh-CN")}</span> 条</p><p className="text-xs text-muted-foreground">各组数量合并提交，稿件不重复分配。</p></div>
      {overview.otherPeriodAssigned > 0 && <p className="text-xs text-muted-foreground">另有 {overview.otherPeriodAssigned.toLocaleString("zh-CN")} 条稿件已在其他统计周期分配，本次将跳过。</p>}
      {!active.length && <p role="status" className="py-2 text-sm text-muted-foreground">暂无可用审核员，请联系管理员创建或启用审核员账户。</p>}
      {!!overview.reviewers.length && <Table className="min-w-[480px] [&_td]:align-middle"><TableHeader><TableRow><TableHead>审核员当前工作量</TableHead><TableHead>已分配</TableHead><TableHead>待审核</TableHead><TableHead>已完成</TableHead></TableRow></TableHeader><TableBody>{overview.reviewers.map((row) => <TableRow key={row.id}><TableCell><p className="text-sm font-medium">{row.displayName}</p><p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{row.username}</p></TableCell><TableCell className="tabular-nums">{row.assigned.toLocaleString("zh-CN")}</TableCell><TableCell className="tabular-nums">{row.pending.toLocaleString("zh-CN")}</TableCell><TableCell className="tabular-nums">{row.reviewed.toLocaleString("zh-CN")}</TableCell></TableRow>)}</TableBody></Table>}
      <p className="text-xs leading-5 text-muted-foreground">可添加多个平均分配或指定量分配组。同一审核员可参加多组，数量合计；随机选稿，优先分散同一作者。</p>
      {drafts.map((group, index) => {
        const otherTotal = drafts.reduce((sum, other) => sum + (other.id === group.id ? 0 : draftGroupTotal(other)), 0);
        const remaining = Number.isSafeInteger(otherTotal) ? Math.max(0, overview.eligible - otherTotal) : 0;
        return <div key={group.id} className="flex min-w-0 flex-col gap-5"><Separator /><ReviewAssignmentGroupEditor group={group} index={index} reviewers={overview.reviewers} remaining={remaining} busy={busy} removable={drafts.length > 1} onChange={(patch) => { setDrafts((old) => old.map((item) => item.id === group.id ? { ...item, ...patch } : item)); change(); }} onRemove={() => { setDrafts((old) => old.filter((item) => item.id !== group.id)); change(); }} /></div>;
      })}
      <div><Button variant="outline" size="sm" disabled={busy || drafts.length >= 20} onClick={addGroup}><Plus data-icon="inline-start" />添加分配组</Button></div>
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Separator />
      {ready && preview ? <section aria-label="分配预览" className="flex flex-col gap-4">
        <ReviewAssignmentPreview groups={preview.input.groups} reviewers={overview.reviewers} available={preview.input.expectedEligibleCount} />
        <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setPreview(null)}>返回调整</Button><Button disabled={busy} onClick={assign}><UserRoundCheck data-icon="inline-start" />{busy ? "正在分配…" : "确认组合分配"}</Button></div>
      </section> : <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground tabular-nums">本次计划分配 {safeTotal.toLocaleString("zh-CN")} 条</p><Button onClick={showPreview} disabled={busy || !overview.eligible || !active.length}><Shuffle data-icon="inline-start" />预览分配</Button></div>}
    </CardContent>
  </Card>;
}
