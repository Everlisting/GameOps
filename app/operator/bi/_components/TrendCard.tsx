"use client";

/**
 * 趋势 · 交互式双轴折线。
 * 一图两线:每日「投稿量增量」(左轴,稿件口径) + 每日「播放量增量」(右轴,播放口径)。
 * 两者量级差异大,故左右各一条纵轴。右上角日期控件调整窗口(URL 同步),默认近 30 天。
 */
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

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
import DateRangeField from "@/app/operator/_components/DateRangeField";

import type { DashboardData } from "../_lib/aggregate";

const chartConfig = {
  worksDelta: { label: "投稿量", color: "var(--chart-1)" },
  viewsDelta: { label: "播放量", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** 播放量压缩成 w(万)/亿。 */
function fmtViews(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}w`;
  return `${n}`;
}

export function TrendCard({
  trend,
  range,
  className,
}: {
  trend: DashboardData["trend"];
  range: DashboardData["trendRange"];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  // 图例点击切换某条曲线的显隐
  const [hidden, setHidden] = React.useState<Record<string, boolean>>({});
  const toggle = (key: string) =>
    setHidden((h) => ({ ...h, [key]: !h[key] }));

  // 日期控件最大可选 = 昨天(T-1),禁用今天及未来
  const maxDate = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 1);
    return d;
  }, []);

  function commitRange(from: string, to: string) {
    const params = new URLSearchParams(search.toString());
    if (from) params.set("trendFrom", from);
    else params.delete("trendFrom");
    if (to) params.set("trendTo", to);
    else params.delete("trendTo");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <Card className={cn("flex flex-col py-0", className)}>
      <CardHeader className="flex flex-col items-stretch gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:py-5">
        <div className="flex flex-col gap-1">
          <CardTitle>播放 / 投稿趋势</CardTitle>
          <CardDescription>
            每日「投稿量增量」与「播放量增量」（{range.from} ~ {range.to}）
          </CardDescription>
        </div>
        <DateRangeField
          from={range.from}
          to={range.to}
          width="w-50"
          clearable={false}
          disabled={{ after: maxDate }}
          onChange={commitRange}
        />
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:p-6">
        {/* 图例:顶部居中,两个小圆圈居中靠拢,标签分居两侧;点击切换曲线显隐。
            隐藏态 = 整体变灰(文字+圆变淡),无横线。 */}
        <div className="mb-2 flex items-center justify-center gap-2">
          {/* 左侧:投稿量 文字 + 圆 */}
          <button
            type="button"
            onClick={() => toggle("worksDelta")}
            className={cn(
              "flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity",
              hidden.worksDelta && "opacity-40",
            )}
          >
            {chartConfig.worksDelta.label}
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ background: chartConfig.worksDelta.color }}
            />
          </button>
          {/* 右侧:圆 + 播放量 文字 */}
          <button
            type="button"
            onClick={() => toggle("viewsDelta")}
            className={cn(
              "flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity",
              hidden.viewsDelta && "opacity-40",
            )}
          >
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ background: chartConfig.viewsDelta.color }}
            />
            {chartConfig.viewsDelta.label}
          </button>
        </div>
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[260px] w-full"
        >
          <LineChart
            accessibilityLayer
            data={trend}
            margin={{ top: 16, left: 12, right: 12 }}
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
            {/* 左轴:稿件(投稿量)。固定刻度 0~3000(步长 500),锁死量程等分 */}
            <YAxis
              yAxisId="left"
              orientation="left"
              tickLine={false}
              axisLine={false}
              width={40}
              domain={[0, 3000]}
              ticks={[0, 500, 1000, 1500, 2000, 2500, 3000]}
              allowDataOverflow
              tickFormatter={(v) => `${v}`}
            />
            {/* 右轴:播放量。固定刻度 0~3000w(步长 500w),与左轴同为 7 个刻度对齐 */}
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              width={52}
              domain={[0, 30_000_000]}
              ticks={[
                0, 5_000_000, 10_000_000, 15_000_000, 20_000_000, 25_000_000,
                30_000_000,
              ]}
              allowDataOverflow
              tickFormatter={(v) => (v === 0 ? "0" : `${Number(v) / 10_000}w`)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  className="w-[180px]"
                  labelFormatter={(value) =>
                    new Date(value as string).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  }
                  formatter={(val, name) => {
                    const label = chartConfig[name as keyof typeof chartConfig]?.label ?? name;
                    const num = Number(val);
                    const text = name === "viewsDelta" ? fmtViews(num) : num.toLocaleString();
                    return (
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="size-2 rounded-[2px]"
                            style={{ background: `var(--color-${name})` }}
                          />
                          {label}
                        </span>
                        <span className="font-mono font-medium tabular-nums">{text}</span>
                      </div>
                    );
                  }}
                />
              }
            />
            <Line
              yAxisId="left"
              dataKey="worksDelta"
              type="monotone"
              stroke="var(--color-worksDelta)"
              strokeWidth={2}
              dot={false}
              hide={hidden.worksDelta}
            />
            <Line
              yAxisId="right"
              dataKey="viewsDelta"
              type="monotone"
              stroke="var(--color-viewsDelta)"
              strokeWidth={2}
              dot={false}
              hide={hidden.viewsDelta}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
