"use client";

/**
 * 运营端 · 活动列表筛选条:名称 + 状态 + 起止日期(过滤 startAt)。
 * 复用创作者端 DatePickerField,行为与创作者端 ActivityFilters 一致。
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DatePickerField from "@/app/(creator)/_components/DatePickerField";

export default function ActivitiesListFilters({ includeDraft = true, includeUpcoming = false }: { includeDraft?: boolean; includeUpcoming?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const urlQ = search.get("q") ?? "";
  const urlFrom = search.get("from") ?? "";
  const urlTo = search.get("to") ?? "";
  const rawStatus = search.get("status") ?? "";
  const statuses = ["ONGOING", "ENDED", ...(includeDraft ? ["DRAFT"] : []), ...(includeUpcoming ? ["UPCOMING"] : [])];
  const urlStatus = statuses.includes(rawStatus) ? rawStatus : "";

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

  const hasAny = !!(urlQ || urlFrom || urlTo || rawStatus);

  return (
    <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(8rem,0.5fr)_auto_auto_auto] xl:items-end">
      <Field>
        <FieldLabel htmlFor="act-q">活动名称</FieldLabel>
          <Input
            id="act-q"
            value={q}
            placeholder="按活动名称搜索…"
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
      </Field>

      <Field>
        <FieldLabel htmlFor="act-status">活动状态</FieldLabel>
        <Select value={urlStatus || "__all"} onValueChange={(value) => commit({ status: value === "__all" ? "" : value })}>
          <SelectTrigger id="act-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="__all">全部状态</SelectItem>
              <SelectItem value="ONGOING">进行中</SelectItem>
              {includeUpcoming && <SelectItem value="UPCOMING">未开始</SelectItem>}
              {includeDraft && <SelectItem value="DRAFT">草稿</SelectItem>}
              <SelectItem value="ENDED">已结束</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <DatePickerField
        id="act-from"
        label="开始日期从"
        value={urlFrom}
        onChange={(v) => commit({ from: v })}
      />
      <DatePickerField
        id="act-to"
        label="开始日期至"
        value={urlTo}
        onChange={(v) => commit({ to: v })}
      />

      <Button
        type="button"
        variant="outline"
        className="self-end"
        onClick={() => { setQ(""); commit({ q: "", status: "", from: "", to: "" }); }}
        disabled={!hasAny}
      >
        <X data-icon="inline-start" />
        清除
      </Button>
    </FieldGroup>
  );
}
