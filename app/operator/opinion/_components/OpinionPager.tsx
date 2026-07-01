"use client";

/**
 * 分页 · 上/下一页按钮(URL 同步)。
 * page=1 时省略 page 参数(URL 更干净)。
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function OpinionPager({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function jump(p: number) {
    const params = new URLSearchParams(search.toString());
    if (p === 1) params.delete("page");
    else params.set("page", String(p));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => jump(page - 1)}
        disabled={page <= 1}
      >
        <ChevronLeft className="size-3.5" />
        上一页
      </Button>
      <span className="text-xs text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => jump(page + 1)}
        disabled={page >= totalPages}
      >
        下一页
        <ChevronRight className="size-3.5" />
      </Button>
    </div>
  );
}
