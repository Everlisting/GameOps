"use client";

/**
 * 业务结构 · 4 个甜甜圈饼图(各占 1 张 shadcn Card)。
 * 增强:外置标签(引导线标数值,小扇区也可读) + 图例联动(悬停高亮,其余淡化) +
 * 小项合并(项多时把尾部小项并入「其他」;作者分层固定 5 层不触发)。
 */
import * as React from "react";
import { Cell, Label, Pie, PieChart } from "recharts";

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

type Slice = { name: string; value: number; key: string };

const MAX_SLICES = 6; // 超过则把尾部小项并入「其他」

/** 小项合并:去掉 0 值;项数超过上限时,保留最大的几项,其余合并为「其他」。 */
function mergeSmall(slices: Slice[]): Slice[] {
  const nonzero = slices.filter((s) => s.value > 0);
  if (nonzero.length <= MAX_SLICES) return nonzero;
  const sorted = [...nonzero].sort((a, b) => b.value - a.value);
  const keep = sorted.slice(0, MAX_SLICES - 1);
  const other = sorted
    .slice(MAX_SLICES - 1)
    .reduce((s, x) => s + x.value, 0);
  return [...keep, { name: "其他", value: other, key: "__other" }];
}

export function PiesCard({ pies }: { pies: DashboardData["pies"] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <PieCell
        title="作者分层"
        description="本月按播放总量"
        unit="人"
        slices={pies.authorTier}
      />
      <PieCell
        title="作品分层"
        description="本月按播放量"
        unit="个"
        slices={pies.workTier}
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
  const [activeKey, setActiveKey] = React.useState<string | null>(null);

  const display = React.useMemo(() => mergeSmall(slices), [slices]);
  const total = display.reduce((s, x) => s + x.value, 0);

  const data = display.map((s, i) => ({
    ...s,
    fill: `var(--chart-${(i % 5) + 1})`,
  }));

  const config: ChartConfig = {
    value: { label: "数量" },
    ...Object.fromEntries(
      display.map((s, i) => [
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
                content={<ChartTooltipContent hideLabel nameKey="key" />}
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="key"
                innerRadius={56}
                strokeWidth={2}
                onMouseEnter={(_, i) => setActiveKey(data[i]?.key ?? null)}
                onMouseLeave={() => setActiveKey(null)}
              >
                {data.map((d) => (
                  <Cell
                    key={d.key}
                    fill={d.fill}
                    stroke="var(--background)"
                    opacity={activeKey && activeKey !== d.key ? 0.3 : 1}
                  />
                ))}
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
      {/* 图例:固定高度(四卡对齐)、两列三行、显示名称+数值(不含百分比);与扇区悬停联动 */}
      <div className="border-t px-5 py-3">
        <ul className="grid h-[4.5rem] grid-cols-2 grid-rows-3 items-center gap-x-4 gap-y-1 overflow-hidden text-xs">
          {display.slice(0, 6).map((s, i) => (
            <li
              key={s.key}
              onMouseEnter={() => setActiveKey(s.key)}
              onMouseLeave={() => setActiveKey(null)}
              className={cn(
                "flex cursor-default items-center gap-1.5 overflow-hidden rounded px-1 transition-colors",
                activeKey === s.key && "bg-muted",
              )}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-sm"
                style={{ background: `var(--chart-${(i % 5) + 1})` }}
              />
              <span className="flex-1 truncate">{s.name}</span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                {s.value.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
