"use client";

import Link from "next/link";
import { ArrowUpRight, Check, Clock3, X } from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";
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
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { DashboardData } from "../_lib/aggregate";
import { compact, percent, percentageText, reviewHref } from "../_lib/format";
import { cn } from "@/lib/utils";

const config = {
  approved: { label: "合格", color: "var(--bi-output)" },
  rejected: { label: "不合格", color: "var(--destructive)" },
  pending: { label: "待审核", color: "var(--muted)" },
};
export function ReviewQuality({
  totals: t,
  range,
}: {
  totals: DashboardData["totals"];
  range: DashboardData["range"];
}) {
  const progress = percent(t.approved + t.rejected, t.works);
  const rows = [
    {
      key: "approved",
      status: "APPROVED",
      label: "合格",
      count: t.approved,
      icon: Check,
      color: "text-[var(--bi-output)]",
    },
    {
      key: "rejected",
      status: "REJECTED",
      label: "不合格",
      count: t.rejected,
      icon: X,
      color: "text-destructive",
    },
    {
      key: "pending",
      status: "PENDING",
      label: "待审核",
      count: t.pending,
      icon: Clock3,
      color: "text-muted-foreground",
    },
  ];
  const chartData = rows.map((r) => ({
    name: r.label,
    value: r.count,
    fill: `var(--color-${r.key})`,
  }));
  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="pb-1">
        <CardTitle>审核质量</CardTitle>
        <CardDescription>所选发布时间内作品的当前审核状态</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-center gap-3 py-3">
          <div className="relative size-28 shrink-0">
            {t.works > 0 ? (
              <ChartContainer
                config={config}
                className="h-full w-full aspect-auto"
                aria-label={`审核进度 ${progress}%，合格 ${t.approved} 条，不合格 ${t.rejected} 条，待审核 ${t.pending} 条`}
              >
                <PieChart accessibilityLayer>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideLabel
                        formatter={(value, name) => (
                          <span>
                            {name}：{Number(value).toLocaleString("zh-CN")} 条
                          </span>
                        )}
                      />
                    }
                  />
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="78%"
                    outerRadius="98%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="var(--card)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {chartData.map((r) => (
                      <Cell key={r.name} fill={r.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="absolute inset-1 rounded-full border-[10px] border-muted" />
            )}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
              <span className="text-xl font-semibold tracking-tight tabular-nums">
                {t.works
                  ? percentageText(t.approved + t.rejected, t.works)
                  : "—"}
              </span>
              <span className="text-xs text-muted-foreground">
                {t.works ? "审核进度" : "暂无有效作品"}
              </span>
            </div>
          </div>
          <div className="flex min-w-40 flex-1 flex-col gap-1">
            {rows.map(({ key, status, label, count, icon: Icon, color }) => (
              <Link
                key={key}
                href={reviewHref(range, status)}
                prefetch={false}
                className="flex min-h-11 items-center gap-1.5 rounded-md px-1 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon className={cn("size-4", color)} aria-hidden="true" />
                <span>{label}</span>
                <span
                  className="ml-auto font-medium tabular-nums"
                  title={count.toLocaleString("zh-CN")}
                >
                  {compact(count)}
                </span>
                <span className="w-12 text-right tabular-nums text-muted-foreground">
                  {percentageText(count, t.works)}
                </span>
              </Link>
            ))}
          </div>
        </div>
        <Separator />
        <p className="text-xs leading-5 text-muted-foreground">
          待审核中还有{" "}
          <span className="font-medium text-foreground tabular-nums">
            {t.unassigned.toLocaleString("zh-CN")}
          </span>{" "}
          条未分配，可在审核周期详情中安排审核员。
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full min-h-11" asChild>
          <Link href={reviewHref(range)} prefetch={false}>
            进入稿件审核
            <ArrowUpRight data-icon="inline-end" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
