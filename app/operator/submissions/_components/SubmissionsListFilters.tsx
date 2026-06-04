"use client";

/**
 * 运营端 · 稿件列表筛选条
 * - 搜索框(标题 / 创作者 / 活动名)
 * - 起止日期(过滤 submission.createdAt)
 * - 平台输入(可选,仅在已 activityId 的表格视图下意义大)
 * 行为同创作者端 ActivityFilters:文本回车/失焦提交,日期立即提交。
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import DatePickerField from "@/app/(creator)/_components/DatePickerField";

export default function SubmissionsListFilters({
  showPlatform = false,
  searchPlaceholder = "稿件标题 / 创作者 / 抖音昵称 / 抖音号 / 易闪 ID / 团号...",
}: {
  showPlatform?: boolean;
  /** 不同视图能搜的字段不同,placeholder 由调用方按实际范围给 */
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const urlQ = search.get("q") ?? "";
  const urlFrom = search.get("from") ?? "";
  const urlTo = search.get("to") ?? "";
  const urlPlatform = search.get("platform") ?? "";

  const [q, setQ] = useState(urlQ);
  const [platform, setPlatform] = useState(urlPlatform);
  useEffect(() => setQ(urlQ), [urlQ]);
  useEffect(() => setPlatform(urlPlatform), [urlPlatform]);

  function commit(patch: Record<string, string>) {
    const params = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    // 任意筛选变更后回到第 1 页
    if (params.has("page")) params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const hasAny =
    !!(urlQ || urlFrom || urlTo || (showPlatform && urlPlatform));

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field className="min-w-[200px] flex-1">
        <FieldLabel htmlFor="sub-q">搜索</FieldLabel>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="sub-q"
            value={q}
            placeholder={searchPlaceholder}
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
        id="sub-from"
        label="投稿起始日期"
        value={urlFrom}
        onChange={(v) => commit({ from: v })}
      />
      <DatePickerField
        id="sub-to"
        label="投稿截止日期"
        value={urlTo}
        onChange={(v) => commit({ to: v })}
      />

      {showPlatform && (
        <Field className="w-32">
          <FieldLabel htmlFor="sub-platform">平台</FieldLabel>
          <Input
            id="sub-platform"
            value={platform}
            placeholder="例:抖音"
            onChange={(e) => setPlatform(e.target.value)}
            onBlur={() => {
              if (platform !== urlPlatform) commit({ platform });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit({ platform });
              }
            }}
          />
        </Field>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() =>
          commit({ q: "", from: "", to: "", ...(showPlatform ? { platform: "" } : {}) })
        }
        disabled={!hasAny}
      >
        <X className="size-3.5" />
        清除
      </Button>
    </div>
  );
}
