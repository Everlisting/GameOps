"use client";

import type { ReviewAssignmentGroup } from "@/lib/validation/review-assignment";
import type { AssignmentReviewer } from "@/lib/review-assignments";

export default function ReviewAssignmentPreview({ groups, reviewers, available }: { groups: ReviewAssignmentGroup[]; reviewers: AssignmentReviewer[]; available: number }) {
  const ids = [...new Set(groups.flatMap((group) => group.recipients.map((row) => row.reviewerId)))];
  const totals = groups.map((group) => group.mode === "EVEN" ? group.totalCount ?? 0 : group.recipients.reduce((sum, row) => sum + (row.count ?? 0), 0));
  const total = totals.reduce((sum, count) => sum + count, 0);
  function name(id: string) { const reviewer = reviewers.find((row) => row.id === id); return `${reviewer?.displayName}（${reviewer?.username}）`; }
  return <div className="flex flex-col gap-4">
    <h3 className="text-sm font-semibold">分配预览</h3>
    <p className="text-sm">共 {groups.length} 组，向 {ids.length} 位审核员分配 <strong className="tabular-nums">{total.toLocaleString("zh-CN")}</strong> 条稿件，剩余 {(available - total).toLocaleString("zh-CN")} 条未分配。</p>
    {groups.map((group, index) => {
      const base = Math.floor(totals[index] / group.recipients.length), extra = totals[index] % group.recipients.length;
      return <div key={index} className="flex flex-col gap-2"><h4 className="text-xs font-medium">第{index + 1}组 · {group.mode === "EVEN" ? "平均分配" : "指定量分配"} · {totals[index].toLocaleString("zh-CN")} 条</h4><ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">{group.recipients.map((row) => <li key={row.reviewerId} className="[overflow-wrap:anywhere]">{name(row.reviewerId)}：{group.mode === "QUOTA" ? row.count : extra ? `${base}–${base + 1}` : base} 条</li>)}</ul></div>;
    })}
    <div className="flex flex-col gap-2 text-sm"><h4 className="text-xs font-medium">审核员本次合计</h4><ul className="flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground">{ids.map((id) => {
      let min = 0, max = 0;
      groups.forEach((group, index) => {
        const row = group.recipients.find((item) => item.reviewerId === id); if (!row) return;
        if (group.mode === "QUOTA") { min += row.count ?? 0; max += row.count ?? 0; }
        else { const base = Math.floor(totals[index] / group.recipients.length); min += base; max += base + (totals[index] % group.recipients.length ? 1 : 0); }
      });
      return <li key={id} className="[overflow-wrap:anywhere]">{name(id)}：{min === max ? min : `${min}–${max}`} 条</li>;
    })}</ul><p className="text-xs text-muted-foreground">平均分配有余数时，确认时随机决定多分1条的审核员。</p></div>
  </div>;
}
