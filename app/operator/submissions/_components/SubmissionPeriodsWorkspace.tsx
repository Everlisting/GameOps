import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import type { SubmissionPeriod } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import SubmissionPeriodSummaryCard from "./SubmissionPeriodSummaryCard";
import SubmissionPeriodFilters from "./SubmissionPeriodFilters";
import type { ReviewActor } from "@/lib/video-review-access";

export default function SubmissionPeriodsWorkspace({ periods, canManage, actor, filtered = false }: { periods: SubmissionPeriod[]; canManage: boolean; actor: ReviewActor; filtered?: boolean }) {
  return <div className="flex min-w-0 flex-col gap-5 p-4 md:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-2"><h1 className="text-2xl font-semibold tracking-tight">全部稿件</h1><p className="text-sm text-muted-foreground">按统计周期查看视频稿件的审核结果与进度。</p></div>
      {canManage && <Button asChild><Link href="/operator/submissions/periods/new"><Plus data-icon="inline-start" />新建稿件统计</Link></Button>}
    </header>
    <SubmissionPeriodFilters />
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-medium">稿件统计</h2><p className="text-xs text-muted-foreground" role="status">共 {periods.length} 个统计周期</p></div>
    {periods.length ? <ul className="flex flex-col gap-3" aria-label="稿件统计列表">
      {periods.map((period) => <Suspense key={period.id} fallback={<li aria-label={`${period.title}统计加载中`}><Skeleton className="h-40 w-full rounded-xl" /></li>}><SubmissionPeriodSummaryCard period={period} actor={actor} /></Suspense>)}
    </ul> : <Empty className="border bg-card py-14">
      <EmptyHeader><EmptyTitle>{filtered ? "没有符合条件的稿件统计" : canManage ? "还没有稿件统计" : "暂无分配给你的稿件"}</EmptyTitle><EmptyDescription>{filtered ? "请调整名称或审核状态，或重置筛选查看全部统计。" : canManage ? "新建统计，填写名称和起止日期，即可查看对应周期的稿件审核情况。" : "运营分配稿件后，这里会显示你的统计周期与审核进度。"}</EmptyDescription></EmptyHeader>
      {!filtered && canManage && <Button asChild variant="outline"><Link href="/operator/submissions/periods/new"><Plus data-icon="inline-start" />新建稿件统计</Link></Button>}
    </Empty>}
    {!!periods.length && <p className="text-xs leading-5 text-muted-foreground">按北京时间的发布时间统计，起止日期均含全天，仅包含有效视频。审核进度 =（合格作品数 + 不合格作品数）÷ 稿件数。</p>}
  </div>;
}
