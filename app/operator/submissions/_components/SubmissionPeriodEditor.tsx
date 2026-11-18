"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DatePickerField from "@/app/(creator)/_components/DatePickerField";
import { submissionPeriodSchema, type SubmissionPeriodInput } from "@/lib/validation/submission-period";

export default function SubmissionPeriodEditor({ initial, id, datesLocked = false }: { initial: SubmissionPeriodInput; id?: string; datesLocked?: boolean }) {
  const router = useRouter();
  const returnPath = id ? `/operator/submissions/periods/${id}` : "/operator/submissions";
  const [input, setInput] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const parsed = submissionPeriodSchema.safeParse(input);
  const issues = attempted && !parsed.success ? parsed.error.flatten().fieldErrors : {};
  function change(patch: Partial<SubmissionPeriodInput>) { setInput((old) => ({ ...old, ...patch })); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    setError("");
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      document.getElementById(field === "title" ? "period-title" : field === "startDate" ? "period-start" : "period-end")?.focus();
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/operator/submission-periods${id ? `/${id}` : ""}`, {
        method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);
        const message = typeof data === "object" && data && "error" in data && typeof data.error === "object" && data.error && "message" in data.error && typeof data.error.message === "string" ? data.error.message : "保存失败，请重试。";
        throw new Error(message);
      }
      router.push(returnPath);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "网络错误，请重试。"); }
    finally { setBusy(false); }
  }
  return <Card className="max-w-2xl shadow-none"><CardContent className="p-5 sm:p-6">
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <fieldset disabled={busy}>
        <FieldGroup className="gap-5">
          <Field data-invalid={!!issues.title?.length}>
            <FieldLabel htmlFor="period-title">统计名称</FieldLabel>
            <Input id="period-title" value={input.title} maxLength={120} placeholder="例如：率土之滨7月审核稿件" onChange={(event) => change({ title: event.target.value })} aria-required aria-invalid={!!issues.title?.length} aria-describedby={issues.title?.length ? "period-title-error" : undefined} />
            <FieldError id="period-title-error">{issues.title?.[0]}</FieldError>
          </Field>
          <fieldset disabled={datesLocked} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="min-w-0"><DatePickerField id="period-start" label="开始日期" value={input.startDate} onChange={(startDate) => change({ startDate })} width="w-full" /><FieldError className="mt-2">{issues.startDate?.[0]}</FieldError></div>
            <div className="min-w-0"><DatePickerField id="period-end" label="结束日期" value={input.endDate} onChange={(endDate) => change({ endDate })} width="w-full" /><FieldError className="mt-2">{issues.endDate?.[0]}</FieldError></div>
          </fieldset>
          {datesLocked && <p className="text-xs text-muted-foreground">该周期已有分配稿件，起止日期不可修改；名称和状态仍可编辑。</p>}
          <Field>
            <FieldLabel htmlFor="period-status">审核状态</FieldLabel>
            <Select value={input.status} onValueChange={(status) => change({ status: status as SubmissionPeriodInput["status"] })}>
              <SelectTrigger id="period-status"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="REVIEWING">审核中</SelectItem><SelectItem value="FROZEN">审核冻结</SelectItem></SelectGroup></SelectContent>
            </Select>
          </Field>
          <p className="text-xs leading-5 text-muted-foreground">起止日期按北京时间计算，包含当天全部有效视频。统计在刷新页面时更新；审核状态用于卡片标识与筛选。</p>
        </FieldGroup>
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 border-t pt-4"><Button asChild variant="outline"><Link href={returnPath}>取消</Link></Button><Button type="submit" disabled={busy}>{busy ? "正在保存…" : "保存统计"}</Button></div>
    </form>
  </CardContent></Card>;
}
