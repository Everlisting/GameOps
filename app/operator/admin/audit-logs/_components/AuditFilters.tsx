"use client";

/**
 * 管理员 · 审计日志 · 筛选条
 * 操作人 (q):回车 / 失焦提交
 * 动作 / 目标类型:onChange 即提交
 * 时间段:DateTimePicker(YYYY-MM-DDTHH:mm)失焦/选完即提交
 * 任意筛选变更都重置 page=1。
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

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

import { ACTION_LABEL, TARGET_TYPE_LABEL } from "../labels";

const ALL = "__all";

export default function AuditFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const urlQ = search.get("q") ?? "";
  const urlAction = search.get("action") ?? "";
  const urlTarget = search.get("targetType") ?? "";
  const urlFrom = search.get("from") ?? "";
  const urlTo = search.get("to") ?? "";

  const [q, setQ] = useState(urlQ);
  useEffect(() => setQ(urlQ), [urlQ]);

  function commit(patch: Record<string, string>) {
    const params = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    // 任意筛选变更都回到第一页
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const hasAny = !!(urlQ || urlAction || urlTarget || urlFrom || urlTo);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.2fr)_auto_auto_minmax(0,1.4fr)_minmax(0,1.4fr)_auto] md:items-end">
      <Field>
        <FieldLabel htmlFor="audit-q">操作人</FieldLabel>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="audit-q"
            value={q}
            placeholder="按用户名搜索…"
            className="pl-7"
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => {
              if (q !== urlQ) commit({ q });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit({ q });
              }
            }}
          />
        </div>
      </Field>

      <Field className="w-44">
        <FieldLabel htmlFor="audit-action">动作</FieldLabel>
        <Select
          value={urlAction || ALL}
          onValueChange={(v) => commit({ action: v === ALL ? "" : v })}
        >
          <SelectTrigger id="audit-action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部动作</SelectItem>
            {Object.entries(ACTION_LABEL).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
                <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                  {k}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field className="w-36">
        <FieldLabel htmlFor="audit-target">目标类型</FieldLabel>
        <Select
          value={urlTarget || ALL}
          onValueChange={(v) => commit({ targetType: v === ALL ? "" : v })}
        >
          <SelectTrigger id="audit-target">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部类型</SelectItem>
            {Object.entries(TARGET_TYPE_LABEL).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="audit-from">开始时间</FieldLabel>
        <DateTimePickerField
          id="audit-from"
          value={urlFrom}
          onChange={(v) => commit({ from: v })}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="audit-to">结束时间</FieldLabel>
        <DateTimePickerField
          id="audit-to"
          value={urlTo}
          onChange={(v) => commit({ to: v })}
        />
      </Field>

      <Button
        type="button"
        variant="outline"
        onClick={() =>
          commit({ q: "", action: "", targetType: "", from: "", to: "" })
        }
        disabled={!hasAny}
      >
        <X className="size-3.5" />
        清除
      </Button>
    </div>
  );
}
