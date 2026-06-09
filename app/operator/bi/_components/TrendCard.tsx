"use client";

/**
 * 投稿趋势(近 30 天) · 交互式折线。
 * 头部把"投稿"与"通过"做成两段汇总按钮,点选切换主线条。
 * 参考 shadcn ChartLineInteractive 模板。
 */
import * as React from "react";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

import type { DashboardData } from "../_lib/aggregate";

const chartConfig = {
  count: { label: "数量" },
  submitted: { label: "投稿", color: "var(--chart-1)" },
  approved: { label: "通过", color: "var(--chart-2)" },
} satisfies ChartConfig;

type Metric = "submitted" | "approved";

export function TrendCard({
  trend,
  className,
}: {
  trend: DashboardData["trend"];
  className?: string;
}) {
  const [active, setActive] = React.useState<Metric>("submitted");

  const totals = React.useMemo(
    () => ({
      submitted: trend.reduce((s, d) => s + d.submitted, 0),
      approved: trend.reduce((s, d) => s + d.approved, 0),
    }),
    [trend],
  );

  return (
    <Card className={cn("py-0", className)}>
      <CardHeader className="flex flex-col items-stretch border-b !p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-4 sm:py-5">
          <CardTitle>投稿趋势</CardTitle>
          <CardDescription>近 30 天每日「投稿 / 通过」数</CardDescription>
        </div>
        <div className="flex">
          {(["submitted", "approved"] as const).map((key) => (
            <button
              key={key}
              data-active={active === key}
              onClick={() => setActive(key)}
              className="relative flex flex-1 flex-col justify-center gap-1 border-t px-6 py-3 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-l sm:border-t-0 sm:px-8 sm:py-5"
            >
              <span className="text-xs text-muted-foreground">
                {chartConfig[key].label}
              </span>
              <span className="text-lg font-bold leading-none tabular-nums sm:text-2xl">
                {totals[key].toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:p-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[260px] w-full"
        >
          <LineChart
            accessibilityLayer
            data={trend}
            margin={{ left: 12, right: 12 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(v) => {
                const d = new Date(v as string);
                return `${d.getMonth() + 1}/${d.getDate()}`;
              }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  className="w-[150px]"
                  nameKey="count"
                  labelFormatter={(value) =>
                    new Date(value as string).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  }
                />
              }
            />
            <Line
              dataKey={active}
              type="monotone"
              stroke={`var(--color-${active})`}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
