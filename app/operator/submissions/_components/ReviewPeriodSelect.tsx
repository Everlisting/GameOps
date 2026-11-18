"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ReviewPeriodOption = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
};

export default function ReviewPeriodSelect({
  periods,
}: {
  periods: ReviewPeriodOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const from = search.get("from") ?? "";
  const to = search.get("to") ?? "";
  const selectedId = search.get("reviewPeriod");
  const matchesRange = (period: ReviewPeriodOption) =>
    period.startDate === from && period.endDate === to;
  const selected =
    from || to
      ? ((
          periods.find(
            (period) => period.id === selectedId && matchesRange(period),
          ) ?? periods.find(matchesRange)
        )?.id ?? "__custom")
      : "__all";

  function change(value: string) {
    const period = periods.find((item) => item.id === value);
    if (value !== "__all" && !period) return;
    const params = new URLSearchParams(search.toString());
    if (period) {
      params.set("reviewPeriod", period.id);
      params.set("from", period.startDate);
      params.set("to", period.endDate);
    } else {
      params.delete("reviewPeriod");
      params.delete("from");
      params.delete("to");
    }
    for (const key of ["page", "videoId", "submissionId", "keepFilters"])
      params.delete(key);
    startTransition(() =>
      router.push(`${pathname}${params.size ? `?${params}` : ""}`, {
        scroll: false,
      }),
    );
  }

  return (
    <Field orientation="horizontal" className="w-fit gap-2" aria-busy={pending}>
      <FieldLabel htmlFor="review-period" className="shrink-0">
        审核活动
      </FieldLabel>
      <Select value={selected} onValueChange={change} disabled={pending}>
        <SelectTrigger id="review-period" size="sm" className="w-44 sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="no-scrollbar max-h-[min(10.5rem,var(--radix-select-content-available-height))] [&_[data-radix-select-viewport]]:max-h-42 [&_[data-slot=select-item]]:h-8 [&_[data-slot=select-item]]:whitespace-nowrap [&_[data-slot=select-item]>span:last-child]:truncate [&_[data-slot=select-scroll-up-button]]:hidden [&_[data-slot=select-scroll-down-button]]:hidden">
          <SelectGroup>
            <SelectItem value="__all">全部活动</SelectItem>
            {selected === "__custom" && (
              <SelectItem value="__custom" disabled>
                自定义日期范围
              </SelectItem>
            )}
            {periods.map((period) => (
              <SelectItem
                key={period.id}
                value={period.id}
                title={`${period.title}（${period.startDate} — ${period.endDate}）`}
              >
                {period.title}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
