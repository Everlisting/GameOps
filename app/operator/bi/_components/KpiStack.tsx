/**
 * 核心指标 — 6 个 KPI 单元(2 列 × 3 行)排在一张 shadcn Card 内。
 * 每个单元右上角带当月「每日曲线」sparkline,大数字下方小字显示较上一快照的增量。
 * 数据口径:当月(北京时间自然月),日期按导入时选择的「数据日期」(snapshotDate)。
 * 第 6 格「激励预估」暂留空,后续接入。
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { DashboardData, KpiMetric } from "../_lib/aggregate";
import { Sparkline } from "./Sparkline";

export function KpiStack({
  kpi,
  className,
}: {
  kpi: DashboardData["kpi"];
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <CardTitle>核心指标</CardTitle>
      </CardHeader>
      <CardContent className="grid flex-1 grid-cols-2 gap-3">
        <KpiCell label="播放总量" metric={kpi.playTotal} compact sparkColor="var(--chart-1)" />
        <KpiCell label="稿件总量" metric={kpi.workTotal} sparkColor="var(--chart-2)" />
        <KpiCell label="优质作者数" metric={kpi.qualityCreators} sparkColor="var(--chart-3)" />
        <KpiCell label="优质作品数" metric={kpi.qualityWorks} sparkColor="var(--chart-4)" />
        <KpiCell label="活跃作者" metric={kpi.creators} sparkColor="var(--chart-5)" />
        <KpiPlaceholder label="激励预估" />
      </CardContent>
    </Card>
  );
}

function KpiCell({
  label,
  metric,
  compact = false,
  sparkColor,
}: {
  label: string;
  metric: KpiMetric;
  /** 大数字是否按 万/亿 压缩(播放量用) */
  compact?: boolean;
  sparkColor?: string;
}) {
  const value = compact ? formatCompact(metric.value) : metric.value.toLocaleString();
  return (
    <div className="relative rounded-md border bg-muted/40 px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold leading-none tabular-nums">
        {value}
      </div>
      <Delta value={metric.increment} compact={compact} />
      <div className="absolute right-2 top-6">
        <Sparkline points={metric.spark} color={sparkColor} />
      </div>
    </div>
  );
}

/** 空占位单元:保留 2×3 网格,标注「暂无」。 */
function KpiPlaceholder({ label }: { label: string }) {
  return (
    <div className="relative rounded-md border border-dashed bg-muted/20 px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold leading-none tabular-nums text-muted-foreground/50">
        —
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground/60">敬请期待</div>
    </div>
  );
}

/** 增量小字:较上一快照日的变化,+ 绿 / − 红 / 0 灰;无基线(当月仅一次快照)显示 —。 */
function Delta({ value, compact }: { value: number | null; compact: boolean }) {
  if (value === null) {
    return <div className="mt-1 text-[11px] text-muted-foreground/50">—</div>;
  }
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const mag = compact ? formatCompact(Math.abs(value)) : Math.abs(value).toLocaleString();
  const color =
    value > 0
      ? "text-emerald-600 dark:text-emerald-500"
      : value < 0
        ? "text-rose-600 dark:text-rose-500"
        : "text-muted-foreground/60";
  return (
    <div className={cn("mt-3 text-[11px] tabular-nums", color)}>
      {sign}
      {mag}
      {/* <span className="ml-1 text-muted-foreground/50">较上次</span> */}
    </div>
  );
}

/** 把大数字按量级压成 "1.2亿" / "3.4万" / "123"。 */
function formatCompact(v: number): string {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(2)}亿`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}万`;
  return Math.round(v).toLocaleString();
}
