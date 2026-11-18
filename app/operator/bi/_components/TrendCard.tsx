"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartNoAxesCombined } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import type { DashboardData } from "../_lib/aggregate";
import { compact } from "../_lib/format";

const config = {
  viewsChange: { label: "可比视频播放变化", color: "var(--bi-views)" },
  works: { label: "发布作品", color: "var(--bi-output)" },
};
const dayLabel = (value: string) =>
  `${Number(value.slice(5, 7))}/${Number(value.slice(8))}`;

export function TrendCard({
  trend,
  comparableDays,
  works,
}: {
  trend: DashboardData["trend"];
  comparableDays: number;
  works: number;
}) {
  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="flex-row items-start justify-between gap-3 p-4 pb-2">
        <div className="flex flex-col gap-2">
          <CardTitle>传播与产出趋势</CardTitle>
          <CardDescription>
            播放变化与发布数量分轴展示，避免量级干扰
          </CardDescription>
        </div>
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {trend.length} 天
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2 px-4 pb-3 pt-0">
        <div className="flex items-center justify-between gap-2 text-xs">
          <h2 className="flex items-center gap-2">
            <span
              className="size-2 rounded-full bg-[var(--bi-views)]"
              aria-hidden="true"
            />
            可比视频播放变化
          </h2>
          <span className="text-muted-foreground">单位 / 次</span>
        </div>
        {comparableDays ? (
          <ChartContainer
            config={config}
            className="h-32 w-full aspect-auto"
            role="img"
            aria-label="每日可比视频播放变化折线图，可通过下方查看趋势数据读取数值"
          >
            <LineChart
              data={trend}
              margin={{ left: 0, right: 8, top: 10, bottom: 0 }}
              accessibilityLayer
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={dayLabel}
                tick={{ fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                minTickGap={35}
              />
              <YAxis
                tickFormatter={compact}
                tick={{ fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={68}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) =>
                      payload[0]?.payload.date ?? ""
                    }
                    formatter={(value, _, item) => (
                      <div className="flex flex-col gap-1">
                        <span>
                          播放变化：{Number(value).toLocaleString("zh-CN")} 次
                        </span>
                        <span className="text-muted-foreground">
                          可比{" "}
                          {Number(item.payload.matched).toLocaleString("zh-CN")}{" "}
                          条 / 当日有快照{" "}
                          {Number(item.payload.recorded).toLocaleString(
                            "zh-CN",
                          )}{" "}
                          条
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Line
                type="linear"
                dataKey="viewsChange"
                stroke="var(--color-viewsChange)"
                strokeWidth={2}
                dot={{ r: 2, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <Empty className="h-32 gap-2 py-4">
            <EmptyHeader className="gap-2">
              <EmptyMedia>
                <ChartNoAxesCombined aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>暂无连续日快照</EmptyTitle>
              <EmptyDescription>
                缺少可比数据，播放变化暂不绘制。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <div className="flex items-center justify-between gap-2 text-xs">
          <h2 className="flex items-center gap-2">
            <span
              className="size-2 rounded-full bg-[var(--bi-output)]"
              aria-hidden="true"
            />
            每日发布作品
          </h2>
          <span className="text-muted-foreground">
            合计 {works.toLocaleString("zh-CN")} 条
          </span>
        </div>
        <ChartContainer
          config={config}
          className="h-20 w-full aspect-auto"
          role="img"
          aria-label="每日发布作品数量折线图，可通过下方查看趋势数据读取数值"
        >
          <LineChart
            data={trend}
            margin={{ left: 0, right: 8, top: 5, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={dayLabel}
              tick={{ fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              minTickGap={35}
            />
            <YAxis
              tickFormatter={compact}
              tick={{ fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={68}
              allowDecimals={false}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) =>
                    payload[0]?.payload.date ?? ""
                  }
                  formatter={(value) => (
                    <span>
                      发布作品：{Number(value).toLocaleString("zh-CN")} 条
                    </span>
                  )}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="works"
              stroke="var(--color-works)"
              strokeWidth={2}
              dot={trend.length === 1 ? { r: 3 } : false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-1 px-4 pb-4 pt-0">
        <p className="text-xs leading-5 text-muted-foreground">
          {comparableDays} / {trend.length}{" "}
          天有可比快照。仅比较同一视频的相邻日累计值，缺失处留空；负值表示数据回调。
        </p>
        <details className="sr-only focus-within:not-sr-only">
          <summary>查看趋势数据</summary>
          <ul>
            {trend.map((day) => (
              <li key={day.date}>
                {day.date}，发布 {day.works} 条，播放变化{" "}
                {day.viewsChange === null
                  ? "无可比快照"
                  : `${day.viewsChange} 次`}
                ，可比 {day.matched} 条，当日快照 {day.recorded} 条。
              </li>
            ))}
          </ul>
        </details>
      </CardFooter>
    </Card>
  );
}
