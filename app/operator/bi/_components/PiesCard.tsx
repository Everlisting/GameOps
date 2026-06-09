"use client";

/**
 * 业务结构 · 4 个甜甜圈饼图(各占 1 张 shadcn Card)。
 * 参考 shadcn ChartPieDonutText 模板,中心显示总数 + 维度标签。
 */
import * as React from "react";
import { Label, Pie, PieChart } from "recharts";

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

import type { DashboardData } from "../_lib/aggregate";

type Slice = { name: string; value: number; key: string };

export function PiesCard({ pies }: { pies: DashboardData["pies"] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <PieCell
        title="稿件状态"
        description="按审核状态分布"
        unit="条"
        slices={pies.submissionStatus}
      />
      <PieCell
        title="活动状态"
        description="按生命周期分布"
        unit="个"
        slices={pies.activityStatus}
      />
      <PieCell
        title="稿件平台"
        description="按发布平台分布"
        unit="条"
        slices={pies.platform}
      />
      <PieCell
        title="创作者分组"
        description="按团号分布"
        unit="人"
        slices={pies.groupNo}
      />
    </div>
  );
}

function PieCell({
  title,
  description,
  unit,
  slices,
}: {
  title: string;
  description: string;
  unit: string;
  slices: Slice[];
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);

  // 给每片塞 chart-N 变量;按 index mod 5
  const data = slices.map((s, i) => ({
    ...s,
    fill: `var(--chart-${(i % 5) + 1})`,
  }));

  // 用 stable 索引 key 喂 chartConfig,避免动态字符串落进 CSS 变量名
  const config: ChartConfig = {
    value: { label: "数量" },
    ...Object.fromEntries(
      slices.map((s, i) => [
        s.key,
        { label: s.name, color: `var(--chart-${(i % 5) + 1})` },
      ]),
    ),
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        {total > 0 ? (
          <ChartContainer
            config={config}
            className="mx-auto aspect-square max-h-[220px]"
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel nameKey="name" />}
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="key"
                innerRadius={56}
                strokeWidth={5}
              >
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy}
                            className="fill-foreground text-2xl font-bold"
                          >
                            {total.toLocaleString()}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 22}
                            className="fill-muted-foreground text-xs"
                          >
                            {unit}
                          </tspan>
                        </text>
                      );
                    }
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        ) : (
          <div className="mx-auto grid aspect-square max-h-[220px] place-items-center text-xs text-muted-foreground">
            暂无数据
          </div>
        )}
      </CardContent>
      <div className="border-t px-5 py-3">
        <ul className="space-y-1.5 text-xs">
          {slices.map((s, i) => {
            const pct = total ? ((s.value / total) * 100).toFixed(1) : "0.0";
            return (
              <li
                key={s.key}
                className="grid grid-cols-[0.5rem_1fr_auto] items-center gap-2"
              >
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ background: `var(--chart-${(i % 5) + 1})` }}
                />
                <span className="truncate">{s.name}</span>
                <span className="font-mono text-muted-foreground tabular-nums">
                  {pct}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
