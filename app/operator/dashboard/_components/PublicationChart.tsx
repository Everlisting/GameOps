"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  works: { label: "作品数", color: "var(--chart-1)" },
} satisfies ChartConfig;

export default function PublicationChart({
  data,
}: {
  data: { date: string; works: number }[];
}) {
  return (
    <div>
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-52 w-full"
        role="img"
        aria-label={`所选月份每日发布作品数，共 ${data.reduce((sum, day) => sum + day.works, 0).toLocaleString("zh-CN")} 条`}
      >
        <LineChart
          data={data}
          margin={{ top: 16, right: 12, left: 0 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={32}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                className="w-[180px]"
                labelFormatter={(date) => `${String(date).replaceAll("-", "/")} 发布`}
                formatter={(value) => (
                  <div className="flex w-full items-center justify-between gap-4 text-xs">
                    <span className="text-muted-foreground">作品数</span>
                    <span className="font-medium tabular-nums">
                      {Number(value ?? 0).toLocaleString("zh-CN")} 条
                    </span>
                  </div>
                )}
              />
            }
          />
          <Line
            dataKey="works"
            type="monotone"
            stroke="var(--color-works)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
      <details className="sr-only focus-within:not-sr-only">
        <summary>查看每日发布数据</summary>
        <ul>
          {data.map((day) => (
            <li key={day.date}>
              {day.date}，{day.works} 条
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
