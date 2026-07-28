"use client";

/**
 * 管理员 · 运行错误 · 筛选条(URL 同步)。
 * level:onChange 即提交;module/requestId/traceId/taskId/fingerprint:回车/失焦提交;时间段:选完即提交。
 * 任意筛选变更都重置 page=1。
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import DateTimePickerField from "@/app/operator/_components/DateTimePickerField";

const ALL = "__all";
const TEXT_KEYS = ["module", "requestId", "traceId", "taskId", "fingerprint"] as const;
const LABELS: Record<(typeof TEXT_KEYS)[number], string> = {
  module: "模块",
  requestId: "requestId",
  traceId: "traceId",
  taskId: "taskId",
  fingerprint: "fingerprint",
};

export default function LogFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function commit(patch: Record<string, string>) {
    const params = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const urlLevel = search.get("level") ?? "";
  const urlFrom = search.get("from") ?? "";
  const urlTo = search.get("to") ?? "";
  const hasAny =
    !!(urlLevel || urlFrom || urlTo) || TEXT_KEYS.some((k) => !!search.get(k));

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field className="w-32">
        <FieldLabel htmlFor="log-level">级别</FieldLabel>
        <Select
          value={urlLevel || ALL}
          onValueChange={(v) => commit({ level: v === ALL ? "" : v })}
        >
          <SelectTrigger id="log-level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部</SelectItem>
            <SelectItem value="error">error</SelectItem>
            <SelectItem value="fatal">fatal</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {TEXT_KEYS.map((k) => (
        <TextFilter key={k} name={k} label={LABELS[k]} urlValue={search.get(k) ?? ""} onCommit={commit} />
      ))}

      <Field className="w-52">
        <FieldLabel htmlFor="log-from">开始时间</FieldLabel>
        <DateTimePickerField id="log-from" value={urlFrom} onChange={(v) => commit({ from: v })} />
      </Field>
      <Field className="w-52">
        <FieldLabel htmlFor="log-to">结束时间</FieldLabel>
        <DateTimePickerField id="log-to" value={urlTo} onChange={(v) => commit({ to: v })} />
      </Field>

      <Button
        type="button"
        variant="outline"
        onClick={() =>
          commit({ level: "", module: "", requestId: "", traceId: "", taskId: "", fingerprint: "", from: "", to: "" })
        }
        disabled={!hasAny}
      >
        <X className="size-3.5" />
        清除
      </Button>
    </div>
  );
}

function TextFilter({
  name,
  label,
  urlValue,
  onCommit,
}: {
  name: string;
  label: string;
  urlValue: string;
  onCommit: (patch: Record<string, string>) => void;
}) {
  const [v, setV] = useState(urlValue);
  useEffect(() => setV(urlValue), [urlValue]);
  const submit = () => {
    if (v.trim() !== urlValue) onCommit({ [name]: v.trim() });
  };
  return (
    <Field className="w-40">
      <FieldLabel htmlFor={`log-${name}`}>{label}</FieldLabel>
      <Input
        id={`log-${name}`}
        value={v}
        placeholder={name === "module" ? "模糊匹配…" : "精确…"}
        onChange={(e) => setV(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
    </Field>
  );
}
