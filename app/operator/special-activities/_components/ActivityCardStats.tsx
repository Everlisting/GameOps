import { Skeleton } from "@/components/ui/skeleton";
import { activityCardSummary, type ActivityCardSummary } from "@/lib/special-activities/card-summary";

function StatsGrid({ summary, settled, loading = false }: {
  summary?: ActivityCardSummary; settled: boolean; loading?: boolean;
}) {
  const values = [
    { label: "稿件数", value: summary?.videoCount.toLocaleString("zh-CN") },
    { label: "达人数", value: summary?.authorCount.toLocaleString("zh-CN") },
    { label: "推荐播放量", value: summary?.recommendedViews.toLocaleString("zh-CN") },
    { label: settled ? "结算金额" : "预估金额", value: summary && `¥${(summary.totalCents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ];
  return <dl className="grid grid-cols-2 gap-x-5 gap-y-3 lg:grid-cols-4" aria-busy={loading}>
    {values.map(({ label, value }) => <div key={label} className="flex min-w-0 flex-col gap-1 lg:border-l lg:border-border/60 lg:pl-5 lg:first:border-l-0 lg:first:pl-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-h-6 whitespace-nowrap text-base font-semibold leading-6 tabular-nums">
        {loading ? <Skeleton className="my-1 h-4 w-20 max-w-full" /> : value ?? "—"}
      </dd>
    </div>)}
  </dl>;
}

export function ActivityCardStatsSkeleton({ settled }: { settled: boolean }) {
  return <StatsGrid settled={settled} loading />;
}

export default async function ActivityCardStats({ id, revision, settledAt }: { id: string; revision: number; settledAt: string | null }) {
  try {
    const summary = await activityCardSummary(id, revision, settledAt);
    return <StatsGrid summary={summary} settled={!!settledAt} />;
  } catch {
    return <div className="flex flex-col gap-2">
      <StatsGrid settled={!!settledAt} />
      <p className="text-xs text-muted-foreground" role="status">统计暂不可用，请进入详情页查看。</p>
    </div>;
  }
}
