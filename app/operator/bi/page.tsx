/**
 * 运营端 · BI 大屏
 * 顺承 operator layout 的 SidebarInset,提供"全屏"按钮一键铺满视口。
 * 布局:KPI(1) + Trend(2) + Top(1) 一行 → 4 张饼图一行 → 事件流满屏。
 */
import { requireRole } from "@/lib/rbac";
import { aggregateDashboard } from "./_lib/aggregate";
import { FullscreenShell } from "./_components/FullscreenShell";
import { KpiStack } from "./_components/KpiStack";
import { TrendCard } from "./_components/TrendCard";
import { TopCard } from "./_components/TopCard";
import { PiesCard } from "./_components/PiesCard";

// 大屏读时实时拉,避免缓存把"实时"字样打脸
export const dynamic = "force-dynamic";

export default async function OperatorBiPage({
  searchParams,
}: {
  searchParams?: { trendFrom?: string; trendTo?: string };
}) {
  await requireRole("OPERATOR");
  const data = await aggregateDashboard({
    trendFrom: searchParams?.trendFrom,
    trendTo: searchParams?.trendTo,
  });

  return (
    <FullscreenShell>
      <div className="grid gap-4 lg:grid-cols-4">
        <KpiStack kpi={data.kpi} className="lg:col-span-1" />
        <TrendCard
          trend={data.trend}
          range={data.trendRange}
          className="lg:col-span-2"
        />
        <TopCard
          anchors={data.topAnchors}
          videos={data.topVideos}
          className="lg:col-span-1"
        />
      </div>
      <PiesCard pies={data.pies} />
    </FullscreenShell>
  );
}
