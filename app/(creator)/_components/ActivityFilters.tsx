"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import DatePickerField from "./DatePickerField";

/**
 * 活动列表筛选条:名称搜索 + 起止日期。
 * 文本输入按回车或失焦提交,日期 onSelect 即提交。
 */
export default function ActivityFilters() {
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

  const hasAny = !!(urlQ || urlFrom || urlTo);

  return (
    <Card className="mb-6 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-end">
        <Field>
          <FieldLabel htmlFor="filter-q">活动名称</FieldLabel>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="filter-q"
              value={q}
              placeholder="搜索活动名称…"
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

        <DatePickerField
          id="filter-from"
          label="活动开始日期"
          value={urlFrom}
          onChange={(v) => commit({ from: v })}
        />
        <DatePickerField
          id="filter-to"
          label="活动结束日期"
          value={urlTo}
          onChange={(v) => commit({ to: v })}
        />

        <Button
          type="button"
          variant="outline"
          onClick={() => commit({ q: "", from: "", to: "" })}
          disabled={!hasAny}
        >
          <X className="size-3.5" />
          清除
        </Button>
      </div>
    </Card>
  );
}
