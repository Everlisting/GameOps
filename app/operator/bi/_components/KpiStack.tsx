/**
 * 核心指标 — 6 个 KPI 单元(2 列 × 3 行)排在一张 shadcn Card 内。
 * 每个单元右上角带 14 天 sparkline,只示意趋势,不交互。
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { DashboardData } from "../_lib/aggregate";
import { Sparkline } from "./Sparkline";

export function KpiStack({
  kpi,
  className,
}: {
  kpi: DashboardData["kpi"];
  className?: string;
}) {
  const incentive = formatYuan(kpi.incentiveTotal);

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <CardTitle>核心指标</CardTitle>
      </CardHeader>
      <CardContent className="grid flex-1 grid-cols-2 gap-3">
        <KpiCell
          label="待审稿件"
          value={kpi.pendingSubmissions.toLocaleString()}
          spark={kpi.sparkSubmissions}
          sparkColor="var(--chart-3)"
        />
        <KpiCell
          label="进行中活动"
          value={kpi.ongoingActivities.toLocaleString()}
          spark={[1, 1, 1, 1, 1, 1, 1]}
          sparkColor="var(--chart-2)"
        />
        <KpiCell
          label="30D 新增稿件"
          value={kpi.submissions30d.toLocaleString()}
          spark={kpi.sparkSubmissions}
          sparkColor="var(--chart-1)"
        />
        <KpiCell
          label="30D 通过率"
          value={kpi.approvalRate30d.toFixed(1)}
          unit="%"
          spark={kpi.sparkApprovalRate}
          sparkColor="var(--chart-2)"
        />
        <KpiCell
          label="累计创作者"
          value={kpi.creatorTotal.toLocaleString()}
          spark={[1, 2, 2, 3, 4, 4, 5, 5, 6, 7]}
          sparkColor="var(--chart-1)"
        />
        <KpiCell
          label="累计预估激励"
          value={incentive.val}
          unit={incentive.unit}
          spark={[1, 2, 3, 3, 4, 5, 6, 7, 8, 9]}
          sparkColor="var(--chart-1)"
        />
      </CardContent>
    </Card>
  );
}

function KpiCell({
  label,
  value,
  unit,
  spark,
  sparkColor,
}: {
  label: string;
  value: string;
  unit?: string;
  spark: number[];
  sparkColor?: string;
}) {
  return (
    <div className="relative rounded-md border bg-muted/40 px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold leading-none tabular-nums">
        {value}
        {unit && (
          <span className="ml-1 text-sm font-medium text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      <div className="absolute right-2 top-2">
        <Sparkline points={spark} color={sparkColor} />
      </div>
    </div>
  );
}

/** 把金额按量级拆成"主值 + 单位",复用 KPI 视觉风格 */
function formatYuan(v: number): { val: string; unit: string } {
  if (v >= 100_000_000) return { val: (v / 100_000_000).toFixed(2), unit: "亿元" };
  if (v >= 10_000) return { val: (v / 10_000).toFixed(1), unit: "万元" };
  return { val: Math.round(v).toLocaleString(), unit: "元" };
}
