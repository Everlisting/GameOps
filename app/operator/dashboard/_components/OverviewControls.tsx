"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function OverviewControls({
  month,
  current,
}: {
  month: string;
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(`${current}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - index);
    return date.toISOString().slice(0, 7);
  });
  if (!months.includes(month)) months.push(month);
  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <span className="text-xs text-muted-foreground">项目数据月份</span>
      <Select
        value={month}
        disabled={pending}
        onValueChange={(value) =>
          startTransition(() =>
            router.push(`${pathname}?month=${value}`, { scroll: false }),
          )
        }
      >
        <SelectTrigger aria-label="项目数据统计月份" className="min-h-11 w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {months.map((value) => (
              <SelectItem key={value} value={value}>
                {value.replace("-", " 年 ")} 月
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        className="min-h-11"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        <RefreshCw aria-hidden="true" data-icon="inline-start" />
        {pending ? "加载中…" : "刷新数据"}
      </Button>
    </div>
  );
}
