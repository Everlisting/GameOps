"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import DatePickerField from "./DatePickerField";

/**
 * 投稿页筛选条:活动名/稿件标题搜索,可选起止日期。
 * 文本输入回车 / 失焦提交,日期 onSelect 即提交。
 */
export default function SubmissionFilters({
  showDateFilter = false,
}: {
  showDateFilter?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const urlQ = search.get("q") ?? "";
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
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const hasAny =
    !!urlQ || (showDateFilter && (!!urlFrom || !!urlTo));

  return (
    <div
      className={
        showDateFilter
          ? "grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-end"
          : "flex items-end gap-2"
      }
    >
      <Field className={showDateFilter ? undefined : "max-w-md"}>
        <FieldLabel htmlFor="submission-q">搜索</FieldLabel>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="submission-q"
            value={q}
            placeholder="活动名称或稿件标题…"
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

      {showDateFilter && (
        <>
          <DatePickerField
            id="submission-from"
            label="活动开始日期"
            value={urlFrom}
            onChange={(v) => commit({ from: v })}
          />
          <DatePickerField
            id="submission-to"
            label="活动结束日期"
            value={urlTo}
            onChange={(v) => commit({ to: v })}
          />
        </>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() =>
          commit(showDateFilter ? { q: "", from: "", to: "" } : { q: "" })
        }
        disabled={!hasAny}
      >
        <X className="size-3.5" />
        清除
      </Button>
    </div>
  );
}
