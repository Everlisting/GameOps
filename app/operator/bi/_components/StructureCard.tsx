"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import type { DashboardData, Distribution } from "../_lib/aggregate";
import { percent, percentageText } from "../_lib/format";

export function StructureCard({
  structure,
}: {
  structure: DashboardData["structure"];
}) {
  return (
    <Card className="h-full min-w-0">
      <CardHeader className="p-4 pb-2">
        <CardTitle>内容结构</CardTitle>
        <CardDescription>同一统计范围，用占比比较分布差异</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <Tabs defaultValue="works" className="gap-4">
          <TabsList className="w-full min-h-11" aria-label="内容结构类型">
            <TabsTrigger value="works">作品分层</TabsTrigger>
            <TabsTrigger value="authors">达人分层</TabsTrigger>
            <TabsTrigger value="platforms">平台分布</TabsTrigger>
          </TabsList>
          <TabsContent value="works">
            <DistributionBars rows={structure.works} unit="条作品" />
            <p className="mt-3 text-xs text-muted-foreground">
              按单作品累计播放量分层，包含零播放作品。
            </p>
          </TabsContent>
          <TabsContent value="authors">
            <DistributionBars rows={structure.authors} unit="位达人" />
            <p className="mt-3 text-xs text-muted-foreground">
              按达人在所选范围内作品的累计播放量合计分层。
            </p>
          </TabsContent>
          <TabsContent value="platforms">
            <DistributionBars rows={structure.platforms} unit="条作品" />
            <p className="mt-3 text-xs text-muted-foreground">
              按视频库实际发布平台统计。
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
function DistributionBars({
  rows,
  unit,
}: {
  rows: Distribution;
  unit: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (!total)
    return (
      <Empty className="h-64 py-6">
        <EmptyHeader>
          <EmptyTitle>暂无分布数据</EmptyTitle>
          <EmptyDescription>所选发布时间内没有可统计的内容。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div className="flex max-h-72 flex-col gap-3 overflow-y-auto overscroll-contain">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span>{row.label}</span>
            <span className="text-muted-foreground tabular-nums">
              {row.count.toLocaleString("zh-CN")} {unit}
              <span className="ml-3 inline-block w-12 text-right">
                {percentageText(row.count, total)}
              </span>
            </span>
          </div>
          <Progress
            value={percent(row.count, total)}
            aria-label={`${row.label}：${row.count} ${unit}，占 ${percentageText(row.count, total)}`}
            className="h-1"
          />
        </div>
      ))}
    </div>
  );
}
