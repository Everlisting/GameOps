"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function DetailTabs({ settlement, videos, settled, authorCount, videoCount }: {
  settlement: ReactNode;
  videos: ReactNode;
  settled: boolean;
  authorCount: number;
  videoCount: number;
}) {
  const search = useSearchParams();
  const tab = search.get("tab") === "videos" ? "videos" : "settlement";

  function changeTab(value: string) {
    if (value !== "settlement" && value !== "videos") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    // 仅切换已获取的展示内容，避免重新触发全活动试算。
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  return (
    <Tabs id="activity-detail-tabs" data-horizontal="" value={tab} onValueChange={changeTab} className="min-w-0 scroll-mt-4 flex-col gap-4">
      <TabsList variant="section" aria-label="专题活动详情" className="w-full group-data-horizontal/tabs:h-11">
        <TabsTrigger value="settlement" data-active={tab === "settlement" ? "" : undefined} className="min-w-0 px-3 sm:min-w-36 sm:flex-none sm:px-5">
          {settled ? "结算结果" : "结算预估"}
          <span className="text-xs font-normal tabular-nums text-muted-foreground" aria-label={`${authorCount.toLocaleString()} 位达人`}>{authorCount.toLocaleString()}</span>
        </TabsTrigger>
        <TabsTrigger value="videos" data-active={tab === "videos" ? "" : undefined} className="min-w-0 px-3 sm:min-w-36 sm:flex-none sm:px-5">
          稿件明细
          <span className="text-xs font-normal tabular-nums text-muted-foreground" aria-label={`${videoCount.toLocaleString()} 条稿件`}>{videoCount.toLocaleString()}</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="settlement" className="min-w-0">{settlement}</TabsContent>
      <TabsContent value="videos" className="min-w-0">{videos}</TabsContent>
    </Tabs>
  );
}
