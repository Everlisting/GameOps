"use client";

/**
 * 分页 · 每页条数选择器(URL 同步)。
 * 改 pageSize 同时清掉 page,从第 1 页开始。
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const OPTIONS = [10, 30, 50, 100];

export default function OpinionPageSizeSelect({ pageSize }: { pageSize: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function onChange(v: string) {
    const params = new URLSearchParams(search.toString());
    params.set("pageSize", v);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>每页</span>
      <Select value={String(pageSize)} onValueChange={onChange}>
        <SelectTrigger size="sm" className="h-7 w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n} 条
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
