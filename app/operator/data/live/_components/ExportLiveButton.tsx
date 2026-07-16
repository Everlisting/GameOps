"use client";

/**
 * 「导出」按钮:把当前 URL 上的筛选(搜索/团号/日期/排序)原样带给
 * /api/operator/data/live/export,下载与页面所见一致的 CSV(含本月默认范围)。
 */
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ExportLiveButton() {
  const searchParams = useSearchParams();
  const qs = searchParams?.toString() ?? "";
  const href = `/api/operator/data/live/export${qs ? `?${qs}` : ""}`;

  return (
    <Button asChild size="sm" variant="outline">
      <a href={href} download>
        <Download className="size-3.5" />
        导出
      </a>
    </Button>
  );
}
