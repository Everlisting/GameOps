"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import DatePickerField from "@/app/(creator)/_components/DatePickerField";
import DateTimePickerField from "@/app/operator/_components/DateTimePickerField";
import { fmtDateTime } from "@/lib/format";
import type { ActivityVideo, RewardResult } from "@/lib/special-activities/engine";
import { specialActivitySchema, specialMatchSchema, type SpecialActivityInput } from "@/lib/special-activities/rules";
import RuleEditor, { Choice } from "./RuleEditor";
import FiltersEditor from "./FiltersEditor";

const root = "/operator/special-activities";
const api = "/api/operator/special-activities";
type Match = { total: number; authors: number; sample: ActivityVideo[] };
type Preview = {
  authors: { key: string; name: string; uid: string; platform: string }[];
  selected?: string; totalCents: number; authorTotal: number; missingData: number; missingUid: number; dataAt: string | null;
  videos: ActivityVideo[];
  pools: { name: string; result?: RewardResult["pools"][number]["recipients"][number]; excluded: Record<string, string> }[];
};

async function send<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data: unknown = await response.json();
  if (!response.ok) throw new Error((data as { error?: { message?: string } }).error?.message ?? "请求失败，请重试");
  return data as T;
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return <section id={id} className="flex scroll-mt-4 flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
    <header className="flex flex-col gap-1"><h2 className="text-base font-semibold">{title}</h2>{description && <p className="text-sm text-muted-foreground">{description}</p>}</header>
    {children}
  </section>;
}

export default function ActivityEditor({ initial, editing }: { initial: SpecialActivityInput; editing?: { id: string; revision: number } }) {
  const router = useRouter();
  const [input, setInput] = useState(initial);
  const [importing, setImporting] = useState(false);
  const [match, setMatch] = useState<{ key: string; data: Match }>();
  const [preview, setPreview] = useState<{ key: string; data: Preview }>();
  const [busy, setBusy] = useState<"match" | "estimate" | "save" | null>(null);
  const [error, setError] = useState<{ kind: "match" | "estimate" | "save"; message: string }>();
  const filters = input.filters;
  const filterInput = { startDate: input.startDate, endDate: input.endDate, filters };
  const activity = { ...input, filters };
  const filterKey = JSON.stringify(filterInput);
  const previewKey = JSON.stringify(activity);
  const matched = match?.key === filterKey ? match.data : undefined;
  const result = preview?.key === previewKey ? preview.data : undefined;
  function change(patch: Partial<SpecialActivityInput>) { setInput((previous) => ({ ...previous, ...patch })); }
  async function action(kind: "match" | "estimate" | "save", author?: string) {
    if (importing || busy) return;
    setError(undefined);
    setBusy(kind);
    try {
      if (kind === "match") {
        const parsed = specialMatchSchema.safeParse(filterInput);
        if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join("；"));
        setMatch({ key: filterKey, data: await send<Match>(`${api}/preview`, { kind, input: parsed.data }) });
        return;
      }
      const parsed = specialActivitySchema.safeParse(activity);
      if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join("；"));
      if (kind === "estimate") {
        setPreview({ key: previewKey, data: await send<Preview>(`${api}/preview`, { kind, input: parsed.data, author }) });
        return;
      }
      const saved = editing
        ? await send<{ id: string }>(`${api}/${editing.id}`, { revision: editing.revision, input: parsed.data }, "PATCH")
        : await send<{ id: string }>(api, parsed.data);
      router.push(`${root}/${saved.id}`);
      router.refresh();
    } catch (err) {
      setError({ kind, message: err instanceof Error ? err.message : "操作失败，请重试" });
    } finally {
      setBusy(null);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void action("save"); }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <nav className="flex flex-wrap gap-4 text-sm text-muted-foreground" aria-label="活动配置区段">
        <a href="#basics" className="hover:underline">基础信息</a><a href="#filters" className="hover:underline">稿件筛选</a>
        <a href="#pools" className="hover:underline">奖池规则</a><a href="#preview" className="hover:underline">试算</a>
      </nav>
      <Section id="basics" title="基础信息" description="时间范围按北京时间判断，起止日期均含全天。">
        <FieldGroup className="gap-4">
          <Field><FieldLabel htmlFor="special-title">活动标题</FieldLabel><Input id="special-title" value={input.title} maxLength={120} onChange={(e) => change({ title: e.target.value })} /></Field>
          <Field><FieldLabel htmlFor="special-description">活动描述</FieldLabel><Textarea id="special-description" rows={3} value={input.description} maxLength={3000} onChange={(e) => change({ description: e.target.value })} /></Field>
          <div className="flex flex-wrap gap-3">
            <DatePickerField id="special-start" label="开始日期" value={input.startDate} onChange={(startDate) => change({ startDate })} />
            <DatePickerField id="special-end" label="结束日期" value={input.endDate} onChange={(endDate) => change({ endDate })} />
          </div>
        </FieldGroup>
      </Section>
      <Section id="filters" title="稿件筛选" description="在活动期发布的视频中筛选。多个专题可独立纳入同一视频。">
        <FiltersEditor value={filters} change={(filters) => change({ filters })} disabled={!!busy || importing} onImportingChange={setImporting} />
        <Button type="button" variant="outline" className="self-start" disabled={!!busy || importing} onClick={() => void action("match")}>{busy === "match" ? "查询中…" : "预览匹配稿件"}</Button>
        {error?.kind === "match" && <p role="alert" className="break-words text-sm text-destructive">{error.message}</p>}
        {matched && <div className="flex flex-col gap-2 text-sm" role="status">
          <p>匹配 {matched.total} 条稿件 · {matched.authors} 位可识别达人</p>
          {matched.sample.length > 0 && <ul className="flex flex-col gap-1 text-muted-foreground">{matched.sample.map((video) => <li key={video.id} className="break-words">{video.title}</li>)}</ul>}
        </div>}
      </Section>
      <Section id="pools" title="奖池规则" description="每个奖池从活动稿件出发，按步骤执行。可以先逐稿计奖，也可以先汇总达人再计奖。">
        <RuleEditor pools={input.pools} change={(pools) => change({ pools })} />
      </Section>
      <Section id="preview" title="试算" description="用当前配置试算并查看奖励依据。">
        <FieldGroup className="grid max-w-xl gap-3 sm:grid-cols-2">
          <Choice label="结算取数方式" options={[{ value: "CONFIRMATION", label: "确认时冻结" }, { value: "CUTOFF", label: "固定截止时间" }]} value={input.settlementMode} onChange={(settlementMode) => change({ settlementMode })} />
          {input.settlementMode === "CUTOFF" && <Field><FieldLabel htmlFor="special-cutoff">数据截止时间（北京时间）</FieldLabel><DateTimePickerField id="special-cutoff" value={input.cutoffAt ?? ""} onChange={(cutoffAt) => change({ cutoffAt: cutoffAt || null })} /></Field>}
        </FieldGroup>
        <Button type="button" variant="outline" className="self-start" disabled={!!busy || importing} onClick={() => void action("estimate", result?.selected)}>{busy === "estimate" ? "试算中…" : "运行试算"}</Button>
        {error?.kind === "estimate" && <p role="alert" className="break-words text-sm text-destructive">{error.message}</p>}
        {result && <div className="flex flex-col gap-3 text-sm" aria-live="polite">
          <p>活动预估 ¥{(result.totalCents / 100).toFixed(2)} · 数据更新至 {result.dataAt ? fmtDateTime(result.dataAt) : "暂无数据"}</p>
          {(result.missingData > 0 || result.missingUid > 0) && <p className="text-muted-foreground">缺少可用指标 {result.missingData} 条 · 缺少达人 UID {result.missingUid} 条</p>}
          {result.authors.length > 0 ? <div className="max-w-sm"><Choice label="选择试算达人" value={result.selected ?? ""} options={result.authors.map((author) => ({ value: author.key, label: `${author.name} · ${author.uid}` }))} onChange={(author) => { if (!busy) void action("estimate", author); }} /></div> : <p>暂无可识别达人。</p>}
          {result.selected && <>
            <p className="font-medium">当前达人合计 ¥{(result.authorTotal / 100).toFixed(2)}</p>
            {result.pools.map((pool) => <div key={pool.name} className="flex flex-col gap-1 border-t border-border pt-3">
              <p className="font-medium">{pool.name} · ¥{((pool.result?.paidCents ?? 0) / 100).toFixed(2)} {pool.result?.suppressed && "（被高优先级奖池替代）"}</p>
              {pool.result?.notes.map((note) => <p key={note} className="text-muted-foreground">{note}</p>)}
              <ul className="flex flex-col gap-1 text-muted-foreground">{result.videos.map((video) => <li key={video.id} className="break-words">{video.title} · {video.recommendedViews.toLocaleString()} 推荐播放 · {pool.excluded[video.id] ?? "进入计奖步骤"}</li>)}</ul>
            </div>)}
          </>}
        </div>}
      </Section>
      {error?.kind === "save" && <p role="alert" className="break-words text-sm text-destructive">{error.message}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild><Link href={editing ? `${root}/${editing.id}` : root}>取消</Link></Button>
        <Button type="submit" disabled={!!busy || importing}>{busy === "save" ? "保存中…" : "保存活动"}</Button>
      </div>
    </form>
  );
}
