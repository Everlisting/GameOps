"use client";

/**
 * 「导出」按钮:把当前 URL 上的筛选(搜索/团号/发布日期/状态/排序)原样带给
 * /api/operator/data/videos/export,下载与页面所见一致的 CSV(含本月默认范围)。
 * 用 <a download> 触发浏览器下载,不跳转页面。
 */
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ExportVideosButton() {
  const searchParams = useSearchParams();
  const qs = searchParams?.toString() ?? "";
  const href = `/api/operator/data/videos/export${qs ? `?${qs}` : ""}`;

  return (
    <Button asChild size="sm" variant="outline">
      <a href={href} download>
        <Download className="size-3.5" />
        导出
      </a>
    </Button>
  );
}
