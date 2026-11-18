import { Suspense } from "react";
import type { SubmissionPeriod } from "@prisma/client";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReviewActor } from "@/lib/video-review-access";
import SubmissionPeriodSummaryCard from "./SubmissionPeriodSummaryCard";
import ReviewPeriodCardsDisclosure from "./ReviewPeriodCardsDisclosure";

export default function ReviewPeriodCards({ periods, actor }: { periods: SubmissionPeriod[]; actor: ReviewActor }) {
  const cards = (items: SubmissionPeriod[], label: string) => <ul className="flex min-w-0 flex-col gap-3" aria-label={label}>
    {items.map((period) => <Suspense key={period.id} fallback={<li aria-label={`${period.title}统计加载中`}><Skeleton className="h-72 w-full rounded-xl sm:h-52 lg:h-40" /></li>}><SubmissionPeriodSummaryCard period={period} actor={actor} showAction={false} /></Suspense>)}
  </ul>;
  return <section className="flex min-w-0 flex-col gap-3" aria-labelledby="review-periods-heading">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="review-periods-heading" className="text-sm font-medium">审核周期</h2><span className="text-xs text-muted-foreground tabular-nums">共 {periods.length} 个统计周期</span></div>
    {periods.length ? <>
      {cards(periods.slice(0, 1), "审核周期卡片组")}
      {periods.length > 1 && <ReviewPeriodCardsDisclosure count={periods.length - 1}>{cards(periods.slice(1), "其他审核周期卡片")}</ReviewPeriodCardsDisclosure>}
      <p className="text-xs leading-5 text-muted-foreground">{actor.role === "REVIEWER" ? "仅统计分配给你的有效稿件。" : "按各周期的发布时间范围统计有效稿件。"}下方列表筛选不改变卡片统计。</p>
    </> : <Empty className="rounded-xl border bg-card py-8"><EmptyHeader><EmptyTitle>{actor.role === "REVIEWER" ? "暂无分配给你的审核周期" : "暂无稿件统计周期"}</EmptyTitle><EmptyDescription>{actor.role === "REVIEWER" ? "运营分配稿件后，这里会显示对应周期及你的审核进度。" : "在「全部稿件」中创建统计周期后，这里会显示周期卡片。"}</EmptyDescription></EmptyHeader></Empty>}
  </section>;
}
