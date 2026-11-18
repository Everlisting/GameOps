"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AssignmentReviewer } from "@/lib/review-assignments";

export type AssignmentDraftGroup = { id: string; mode: "EVEN" | "QUOTA"; totalCount: string; selected: string[]; counts: Record<string, string> };
export function draftGroupTotal(group: AssignmentDraftGroup) {
  return group.mode === "EVEN" ? Number(group.totalCount || 0) : group.selected.reduce((sum, id) => sum + Number(group.counts[id] || 0), 0);
}

export default function ReviewAssignmentGroupEditor({ group, index, reviewers, remaining, busy, removable, onChange, onRemove }: {
  group: AssignmentDraftGroup; index: number; reviewers: AssignmentReviewer[]; remaining: number; busy: boolean; removable: boolean;
  onChange: (patch: Partial<AssignmentDraftGroup>) => void; onRemove: () => void;
}) {
  const active = reviewers.filter((row) => row.active);
  const all = !!active.length && active.every((row) => group.selected.includes(row.id));
  const total = draftGroupTotal(group);
  const base = group.selected.length ? Math.floor(total / group.selected.length) : 0;
  const extra = group.selected.length ? total % group.selected.length : 0;
  const validTotal = Number.isSafeInteger(total) && total > 0;
  return <FieldSet className="min-w-0 gap-4" aria-label={`分配组${index + 1}`}>
    <FieldLegend className="mb-0 flex w-full items-center justify-between gap-3"><span>分配组 {index + 1}</span>{removable && <Button variant="ghost" size="sm" disabled={busy} onClick={onRemove} aria-label={`移除分配组${index + 1}`}><Trash2 data-icon="inline-start" />移除此组</Button>}</FieldLegend>
    <FieldGroup className="gap-3 sm:flex-row sm:items-start">
      <Field className="sm:w-48 sm:shrink-0"><FieldLabel htmlFor={`allocation-mode-${group.id}`}>分配模式</FieldLabel>
        <Select value={group.mode} disabled={busy} onValueChange={(value) => onChange({ mode: value as "EVEN" | "QUOTA" })}>
          <SelectTrigger id={`allocation-mode-${group.id}`}><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="EVEN">平均分配</SelectItem><SelectItem value="QUOTA">指定量分配</SelectItem></SelectGroup></SelectContent>
        </Select>
      </Field>
      {group.mode === "EVEN" ? <Field className="min-w-0 sm:max-w-sm"><FieldLabel htmlFor={`allocation-total-${group.id}`}>本组平均分配总量</FieldLabel>
        <div className="flex items-center gap-2"><Input id={`allocation-total-${group.id}`} type="number" min={1} step={1} inputMode="numeric" placeholder="填写本组总条数" disabled={busy} value={group.totalCount} onChange={(event) => onChange({ totalCount: event.target.value })} aria-describedby={`allocation-hint-${group.id}`} />
          <Button variant="outline" size="sm" disabled={busy || remaining <= 0} onClick={() => onChange({ totalCount: String(remaining) })}>使用剩余量</Button></div>
        <p id={`allocation-hint-${group.id}`} className="text-xs leading-5 text-muted-foreground">填写该组总量，再平均分给所选审核员；扣除其他组后还可分配 {remaining.toLocaleString("zh-CN")} 条。</p>
      </Field> : <p className="text-xs leading-5 text-muted-foreground sm:pt-6">填写每位审核员的数量；本组与其他组一起预览、确认。</p>}
    </FieldGroup>
    <Table className="min-w-[420px] [&_td]:align-middle"><TableHeader><TableRow>
      <TableHead className="w-10"><Checkbox aria-label={`第${index + 1}组选择全部可用审核员`} disabled={busy || !active.length} checked={all ? true : group.selected.length ? "indeterminate" : false} onCheckedChange={() => onChange({ selected: all ? [] : active.map((row) => row.id) })} /></TableHead>
      <TableHead>审核员</TableHead><TableHead className="w-44">{group.mode === "EVEN" ? "本组预计分配" : "本组分配数量"}</TableHead>
    </TableRow></TableHeader><TableBody>{reviewers.map((row) => <TableRow key={row.id}>
      <TableCell><Checkbox aria-label={`第${index + 1}组选择审核员${row.displayName}（${row.username}）`} checked={group.selected.includes(row.id)} disabled={busy || !row.active} onCheckedChange={(checked) => onChange({ selected: checked === true ? [...group.selected, row.id] : group.selected.filter((id) => id !== row.id) })} /></TableCell>
      <TableCell><p className="text-sm font-medium">{row.displayName} {!row.active && <Badge variant="muted">不可分配</Badge>}</p><p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{row.username}</p></TableCell>
      <TableCell>{group.mode === "QUOTA" ? <Input type="number" min={1} max={1000000} step={1} inputMode="numeric" aria-label={`第${index + 1}组分配给${row.displayName}的数量`} value={group.counts[row.id] ?? ""} disabled={busy || !row.active || !group.selected.includes(row.id)} onChange={(event) => onChange({ counts: { ...group.counts, [row.id]: event.target.value } })} /> : <span className="text-xs text-muted-foreground tabular-nums">{group.selected.includes(row.id) && validTotal ? `${base}${extra ? `–${base + 1}` : ""} 条` : "—"}</span>}</TableCell>
    </TableRow>)}</TableBody></Table>
  </FieldSet>;
}
