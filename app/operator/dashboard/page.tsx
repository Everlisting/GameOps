import { Suspense } from "react";
import { requireRole } from "@/lib/rbac";
import { chinaDateString } from "@/lib/time";
import { fmtDateTime } from "@/lib/format";
import OverviewControls from "./_components/OverviewControls";
import { OverviewPanelSkeleton } from "./_components/OverviewPanel";
import {
  ActivitySection,
  OpinionSection,
  ProjectSection,
  ReviewSection,
} from "./_components/OverviewSections";
import { overviewMonth } from "./_lib/overview";

export default async function OperatorOverview({
  searchParams,
}: {
  searchParams?: { month?: string };
}) {
  const session = await requireRole("OPERATOR");
  const now = new Date();
  const period = overviewMonth(searchParams?.month, now);
  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 [--primary:var(--sidebar-primary)] [--primary-foreground:var(--sidebar-primary-foreground)] sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">运营概览</h1>
          <p className="text-sm text-muted-foreground">
            {session.displayName ?? session.username}
            ，查看项目表现与当前运营进展。
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <OverviewControls
            month={period.month}
            current={chinaDateString(now).slice(0, 7)}
          />
          <p className="text-xs text-muted-foreground">
            数据读取于 {fmtDateTime(now)} · 北京时间
          </p>
        </div>
      </header>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
        <Suspense key={period.month} fallback={<OverviewPanelSkeleton />}>
          <ProjectSection period={period} />
        </Suspense>
        <Suspense fallback={<OverviewPanelSkeleton />}>
          <ReviewSection actor={session} />
        </Suspense>
      </div>
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <Suspense fallback={<OverviewPanelSkeleton />}>
          <ActivitySection now={now} />
        </Suspense>
        <Suspense fallback={<OverviewPanelSkeleton />}>
          <OpinionSection />
        </Suspense>
      </div>
    </div>
  );
}
