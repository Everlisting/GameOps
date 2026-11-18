import Link from "next/link";
import { CalendarRange, ChevronRight } from "lucide-react";
import ActivityCover from "@/app/(creator)/_components/ActivityCover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { SubmissionPeriodSummary } from "@/lib/submission-period-summary";
import { cn } from "@/lib/utils";

export type SubmissionPeriod = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  status: "REVIEWING" | "FROZEN";
};

export default function SubmissionPeriodCard({ period, summary, action }: {
  period: SubmissionPeriod;
  summary: SubmissionPeriodSummary;
  action: { href: string; label: string } | null;
}) {
  const values = [
    { label: "稿件数", value: summary.videoCount },
    { label: "达人数", value: summary.authorCount },
    { label: "合格作品数", value: summary.approvedCount, views: summary.approvedViews },
    { label: "不合格作品数", value: summary.rejectedCount, views: summary.rejectedViews },
  ];
  const num = (value: number) => value.toLocaleString("zh-CN");
  return (
    <li>
      <Card className="overflow-hidden shadow-none transition-colors duration-150 hover:border-foreground/20 motion-reduce:transition-none">
        <article aria-labelledby={`period-${period.id}`} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-3 p-3 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:p-4">
          <div aria-hidden="true" className="col-start-1 row-start-1 size-12 self-center overflow-hidden rounded-lg">
            <ActivityCover src={null} name={period.title} />
          </div>
          <CardHeader className={cn("col-start-2 row-start-1 min-w-0 justify-center gap-1 p-0", !action && "sm:col-span-2")}>
            <div className="flex min-w-0 items-center gap-2">
            <CardTitle className="min-w-0 text-base font-semibold leading-6 sm:text-lg">
              <h2 id={`period-${period.id}`} className="truncate" title={period.title}>{period.title}</h2>
            </CardTitle>
            <Badge variant={period.status === "FROZEN" ? "muted" : "outline"} className="shrink-0">{period.status === "FROZEN" ? "审核冻结" : "审核中"}</Badge>
            </div>
            <CardDescription className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-4">
              <CalendarRange className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="sr-only">统计时间：</span>
              <time dateTime={period.startDate}>{period.startDate.replaceAll("-", "/")}</time>
              <span>—</span>
              <time dateTime={period.endDate}>{period.endDate.replaceAll("-", "/")}</time>
            </CardDescription>
          </CardHeader>
          <CardContent className="col-span-2 col-start-1 row-start-2 border-t border-border/60 p-0 pt-3 sm:col-span-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(160px,1.3fr)]">
              {values.map(({ label, value, views }) => (
                <div key={label} className="flex min-w-0 flex-col gap-0.5 lg:border-l lg:border-border/60 lg:pl-4 lg:first:border-l-0 lg:first:pl-0">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-base font-semibold leading-5 tabular-nums">{num(value)}</dd>
                  {views !== undefined && <dd className="text-xs text-muted-foreground tabular-nums">推荐播放量 {num(views)}</dd>}
                </div>
              ))}
              <div className="col-span-2 flex min-w-0 flex-col gap-2 sm:col-span-4 lg:col-span-1 lg:border-l lg:border-border/60 lg:pl-4">
                <dt className="flex items-center justify-between gap-2 text-xs text-muted-foreground">审核进度<span className="font-semibold text-foreground tabular-nums">{num(summary.progress)}%</span></dt>
                <dd className="flex flex-col gap-1.5">
                  <Progress value={summary.progress} aria-label={`${period.title}审核进度`} aria-valuetext={`已审核 ${summary.reviewedCount} / ${summary.videoCount}，待审核 ${summary.pendingCount}，${summary.progress}%`} className="[&_[data-slot=progress-indicator]]:bg-sidebar-primary" />
                  <span className="text-xs text-muted-foreground tabular-nums">已审核 {num(summary.reviewedCount)} / {num(summary.videoCount)}</span>
                </dd>
              </div>
            </dl>
          </CardContent>
          {action && <CardFooter className="col-span-2 col-start-1 row-start-3 justify-end gap-2 p-0 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:self-center">
            <Button asChild variant="outline" size="sm"><Link href={action.href} aria-label={`${period.title}：${action.label}`}>
              {action.label}<ChevronRight data-icon="inline-end" aria-hidden="true" />
            </Link></Button>
          </CardFooter>}
        </article>
      </Card>
    </li>
  );
}
