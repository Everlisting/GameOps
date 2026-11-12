"use client";

import { useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  filterLabels, parseListRows, parsePastedList,
  type ActivityFilters, type ActivityFilterRule, type ListKind,
} from "@/lib/special-activities/filters";
import { Choice, matchOptions } from "./RuleEditor";

function ListInput({ kind, initial, disabled, change, onImportingChange }: {
  kind: ListKind;
  initial: string[];
  disabled: boolean;
  change: (values: string[]) => void;
  onImportingChange: (value: boolean) => void;
}) {
  const [text, setText] = useState(() => initial.join("\n"));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const header = kind === "CREATORS" ? "UID" : "视频链接";
  let current: string[] = [];
  try { current = parsePastedList(text, kind); } catch { /* 输入中的错误由 updateText 展示。 */ }

  function updateText(value: string) {
    setText(value);
    setNotice("");
    try {
      const parsed = parsePastedList(value, kind);
      setError("");
      change(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "名单格式不正确");
      // 将无效输入交给保存与试算校验，避免沿用此前的有效名单。
      change(value.split(/\r\n|\n|\r/).filter((line) => line.trim()));
    }
  }

  async function importFile(file: File) {
    setError("");
    setNotice("");
    onImportingChange(true);
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("请选择 .xlsx、.xls 或 .csv 文件");
      if (file.size > 10 * 1024 * 1024) throw new Error("文件不能超过 10 MB");
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: true, codepage: 65001 });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("文件中没有工作表");
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false, raw: true });
      const imported = parseListRows(rows, kind, true);
      if (!imported.length) throw new Error(`「${header}」列没有名单数据`);
      const existing = parsePastedList(text, kind);
      const merged = [...new Set([...existing, ...imported])];
      if (merged.length > 100_000) throw new Error("单份名单最多支持 100,000 项");
      setText(merged.join("\n"));
      change(merged);
      setNotice(`已合并 ${file.name}，新增 ${merged.length - existing.length} 项，当前共 ${merged.length} 项。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "文件读取失败，请检查文件内容");
    } finally {
      onImportingChange(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={`filter-${kind}`}>{header}名单</FieldLabel>
        <Textarea id={`filter-${kind}`} rows={5} value={text} disabled={disabled} aria-invalid={!!error}
          placeholder={kind === "CREATORS" ? "粘贴 UID，每行一个\n例如：\n123456789\n987654321" : "粘贴完整视频链接，每行一个\nhttps://www.douyin.com/video/123456789"}
          onChange={(event) => updateText(event.target.value)} />
        <FieldDescription>支持从 Excel 复制一列，首行可带「{header}」表头。名单按整项匹配，空行及重复项自动忽略。</FieldDescription>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={disabled}
          aria-label={`导入${filterLabels[kind]}文件`} onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
          }} />
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => fileRef.current?.click()}>
          <Upload data-icon="inline-start" />导入名单
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={disabled || !text} onClick={() => updateText("")}>清空</Button>
        <span className="text-xs text-muted-foreground">已识别 {current.length.toLocaleString()} 项</span>
      </div>
      <p className="text-xs text-muted-foreground">导入 .xlsx / .xls / .csv 的首个工作表，表头须包含「{header}」，导入后与当前名单合并。{kind === "CREATORS" ? "UID 长数字请在 Excel 中保存为文本。" : "请使用完整视频链接。"}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    </div>
  );
}

function TitleInput({ rule, disabled, change }: {
  rule: Extract<ActivityFilterRule, { kind: "TITLE" }>;
  disabled: boolean;
  change: (rule: ActivityFilterRule) => void;
}) {
  const [text, setText] = useState(() => rule.values.join("，"));
  return (
    <fieldset disabled={disabled}>
      <FieldGroup className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field>
          <FieldLabel htmlFor="filter-title">标题关键词</FieldLabel>
          <Input id="filter-title" value={text} placeholder="例如 率土之滨，率土星推计划" onChange={(event) => {
            setText(event.target.value);
            change({ ...rule, values: event.target.value.split(/[，,\n]/).map((word) => word.trim()).filter(Boolean) });
          }} />
          <FieldDescription>多个关键词用逗号分隔。</FieldDescription>
        </Field>
        <Choice label="关键词关系" options={matchOptions} value={rule.match} onChange={(match) => change({ ...rule, match })} />
      </FieldGroup>
    </fieldset>
  );
}

export default function FiltersEditor({ value, change, disabled, onImportingChange }: {
  value: ActivityFilters;
  change: (filters: ActivityFilters) => void;
  disabled: boolean;
  onImportingChange: (value: boolean) => void;
}) {
  const available = (Object.keys(filterLabels) as ActivityFilterRule["kind"][])
    .filter((kind) => !value.rules.some((rule) => rule.kind === kind))
    .map((kind) => ({ value: kind, label: filterLabels[kind] }));
  function update(index: number, rule: ActivityFilterRule) {
    change({ ...value, rules: value.rules.map((item, i) => i === index ? rule : item) });
  }
  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-4">
      <div className="max-w-56">
        <Choice label="筛选项关系" value={value.match} options={matchOptions} onChange={(match) => change({ ...value, match })} />
      </div>
      {value.rules.map((rule, index) => (
        <div key={rule.kind} className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{filterLabels[rule.kind]}</h3>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`移除${filterLabels[rule.kind]}筛选`}
              onClick={() => change({ ...value, rules: value.rules.filter((_, i) => i !== index) })}><Trash2 /></Button>
          </div>
          {rule.kind === "TITLE" ? <TitleInput rule={rule} disabled={disabled} change={(next) => update(index, next)} />
            : <ListInput kind={rule.kind} initial={rule.values} disabled={disabled} change={(values) => update(index, { ...rule, values })} onImportingChange={onImportingChange} />}
        </div>
      ))}
      {!value.rules.length && <p className="text-sm text-muted-foreground">未配置筛选项时，纳入活动期内全部可见视频。</p>}
      {!!available.length && <div className="max-w-56">
        <Choice label="添加筛选字段" value="" placeholder="选择字段" options={available} onChange={(kind) => {
          const rule: ActivityFilterRule = kind === "TITLE" ? { kind, match: "ALL", values: [] } : { kind, values: [] };
          change({ ...value, rules: [...value.rules, rule] });
        }} />
      </div>}
    </fieldset>
  );
}
