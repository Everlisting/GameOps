"use client";

/**
 * 舆情监控 · 顶部统计卡片:总数 / 成功 / 失败。
 * 有 in-flight(PENDING/RUNNING > 0)时每 5s 轮询刷新,和列表节奏一致。
 */
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ListChecks, XCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { AnalysisTaskCounts } from "@/lib/opinion/client";

const POLL_MS = 5_000;

export default function OpinionStatsCards({
  scope,
  initialCounts,
}: {
  scope: "private" | "public" | "combined";
  initialCounts: AnalysisTaskCounts;
}) {
  const [counts, setCounts] = useState(initialCounts);

  const hasInflight = useMemo(
    () => counts.pending > 0 || counts.running > 0,
    [counts],
  );

  useEffect(() => {
    if (!hasInflight) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/opinion/tasks/counts?scope=${scope}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        setCounts((await res.json()) as AnalysisTaskCounts);
      } catch {
        // 忽略瞬错,下一轮再拉
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [hasInflight, scope]);

  return (
    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard
        label="任务总数"
        value={counts.total}
        icon={<ListChecks className="size-4 text-muted-foreground" />}
        hint={
          counts.pending + counts.running > 0
            ? `其中 ${counts.pending + counts.running} 条进行中`
            : undefined
        }
      />
      <StatCard
        label="成功"
        value={counts.done}
        icon={<CheckCircle2 className="size-4 text-emerald-600" />}
        valueClassName="text-emerald-700"
      />
      <StatCard
        label="失败"
        value={counts.failed}
        icon={<XCircle className="size-4 text-destructive" />}
        valueClassName="text-destructive"
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  hint,
  valueClassName,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueClassName ?? ""}`}>
        {value.toLocaleString()}
      </div>
      {hint && (
        <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
      )}
    </Card>
  );
}
