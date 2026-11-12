import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { dateValue } from "@/lib/data-period";
import { chinaDateStart, chinaDateString } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ActivitiesListFilters from "../activities/_components/ActivitiesListFilters";
import SpecialActivityCard from "./_components/SpecialActivityCard";
import ActivityCardStats, { ActivityCardStatsSkeleton } from "./_components/ActivityCardStats";

export default async function SpecialActivitiesPage({
  searchParams,
}: {
  searchParams?: { q?: string; status?: string; from?: string; to?: string };
}) {
  await requireRole("OPERATOR");
  const now = new Date();
  const today = chinaDateStart(now);
  const todayString = chinaDateString(now);
  const q = searchParams?.q?.trim();
  const status = searchParams?.status;
  const from = dateValue(searchParams?.from);
  const to = dateValue(searchParams?.to);
  const where: Prisma.SpecialActivityWhereInput = {};
  if (q) where.title = { contains: q, mode: "insensitive" };
  if (status === "ONGOING") {
    where.startDate = { lte: today };
    where.endDate = { gte: today };
  } else if (status === "ENDED") {
    where.endDate = { lt: today };
  } else if (status === "UPCOMING") {
    where.startDate = { gt: today };
  }
  const dateRange = from || to ? { startDate: {
    gte: from ? new Date(`${from}T00:00:00Z`) : undefined,
    lte: to ? new Date(`${to}T00:00:00Z`) : undefined,
  } } : {};
  const activities = await prisma.specialActivity.findMany({
    where: { AND: [where, dateRange] },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    select: { id: true, title: true, description: true, startDate: true, endDate: true, settledAt: true, revision: true },
  });

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-lg font-semibold">专题活动</h1><p className="mt-1 text-sm text-muted-foreground">按发布时间筛选视频，汇总稿件并配置奖池结算。</p></div>
        <Button asChild><Link href="/operator/special-activities/new"><Plus data-icon="inline-start" />新建活动</Link></Button>
      </header>
      <Card className="shadow-none"><CardContent className="p-4"><ActivitiesListFilters includeDraft={false} includeUpcoming /></CardContent></Card>
      <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-medium">活动列表</h2><p className="text-xs text-muted-foreground" role="status">共 {activities.length} 个活动</p></div>
      {activities.length ? (
        <ul className="flex flex-col gap-3" aria-label="专题活动列表">
          {activities.map((activity) => {
            const startDate = activity.startDate.toISOString().slice(0, 10);
            const endDate = activity.endDate.toISOString().slice(0, 10);
            const status = todayString > endDate ? "已结束" : todayString < startDate ? "未开始" : "进行中";
            return <SpecialActivityCard key={activity.id} activity={{ ...activity, startDate, endDate, status, settled: !!activity.settledAt }}
              stats={<Suspense fallback={<ActivityCardStatsSkeleton settled={!!activity.settledAt} />}>
                <ActivityCardStats id={activity.id} revision={activity.revision} settledAt={activity.settledAt?.toISOString() ?? null} />
              </Suspense>} />;
          })}
        </ul>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground" role="status">
          {q || status || from || to ? "没有符合筛选条件的专题活动，请调整或清除筛选。" : "还没有专题活动，点击「新建活动」开始配置。"}
        </p>
      )}
    </div>
  );
}
