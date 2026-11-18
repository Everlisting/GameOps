import { requireRole } from "@/lib/rbac";
import { aggregateDashboard } from "./_lib/aggregate";
import { FullscreenShell } from "./_components/FullscreenShell";
import { KpiSummary } from "./_components/KpiSummary";
import { TrendCard } from "./_components/TrendCard";
import { ReviewQuality } from "./_components/ReviewQuality";
import { TopCard } from "./_components/TopCard";
import { StructureCard } from "./_components/StructureCard";
import { OperationsSignals } from "./_components/OperationsSignals";

export const dynamic = "force-dynamic";

export default async function OperatorBiPage({
  searchParams,
}: {
  searchParams?: { trendFrom?: string; trendTo?: string };
}) {
  await requireRole("OPERATOR");
  const data = await aggregateDashboard(searchParams);
  return (
    <FullscreenShell
      range={data.range}
      loadedAt={data.loadedAt}
      historicalDefault={data.historicalDefault}
    >
      <KpiSummary totals={data.totals} />
      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <TrendCard
            trend={data.trend}
            comparableDays={data.comparableDays}
            works={data.totals.works}
          />
        </div>
        <ReviewQuality totals={data.totals} range={data.range} />
      </div>
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <TopCard
          authors={data.topAuthors}
          videos={data.topVideos}
          range={data.range}
        />
        <StructureCard structure={data.structure} />
      </div>
      <OperationsSignals />
    </FullscreenShell>
  );
}
