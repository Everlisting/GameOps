import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { ArrowRight, CalendarRange, ChevronLeft, Pencil } from "lucide-react";
import { requireRole, hasRole } from "@/lib/rbac";
import { getSubmissionPeriod } from "@/lib/submission-periods";
import { submissionPeriodSummary } from "@/lib/submission-period-summary";
import { periodAssignmentOverview } from "@/lib/review-assignments";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import ReviewAssignmentPanel from "../../_components/ReviewAssignmentPanel";

export default async function SubmissionPeriodDetailPage({ params }: { params: { id: string } }) {
  const actor = await requireRole("REVIEWER");
  const period = await getSubmissionPeriod(params.id, actor).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  const canManage = hasRole(actor.role, "OPERATOR");
  const start = period.startDate.toISOString().slice(0, 10), end = period.endDate.toISOString().slice(0, 10);
  const [summary, allocation] = await Promise.all([
    submissionPeriodSummary(start, end, actor), canManage ? periodAssignmentOverview(period.id, actor) : null,
  ]);
  const query = new URLSearchParams({ from: start, to: end, status: "PENDING", keepFilters: "1" });
  const metrics = [
    { label: actor.role === "REVIEWER" ? "分配给我的稿件" : "稿件数", value: summary.videoCount },
    { label: "达人数", value: summary.authorCount },
    { label: "合格作品数", value: summary.approvedCount, views: summary.approvedViews },
    { label: "不合格作品数", value: summary.rejectedCount, views: summary.rejectedViews },
    { label: "待审核", value: summary.pendingCount },
  ];
  return <div className="flex min-w-0 flex-col gap-5 p-4 md:p-8">
    <Link href="/operator/submissions" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />返回全部稿件</Link>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2"><div className="flex flex-wrap items-center gap-2"><h1 className="min-w-0 max-w-full text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{period.title}</h1><Badge variant={period.status === "FROZEN" ? "muted" : "outline"}>{period.status === "FROZEN" ? "审核冻结" : "审核中"}</Badge></div>
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground"><CalendarRange className="size-4" />{start.replaceAll("-", "/")} — {end.replaceAll("-", "/")}</p>
      </div>
      <div className="flex flex-wrap gap-2">{canManage && <Button asChild variant="outline"><Link href={`/operator/submissions/periods/${period.id}/edit`}><Pencil data-icon="inline-start" />编辑基本信息</Link></Button>}<Button asChild variant="review-primary"><Link href={`/operator/submissions/review?${query}`}>进入稿件审核<ArrowRight data-icon="inline-end" /></Link></Button></div>
    </header>
    <Card className="shadow-none"><CardContent className="flex flex-col gap-4 p-4 sm:p-5">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-5">{metrics.map((metric) => <div key={metric.label} className="flex min-w-0 flex-col gap-1"><dt className="text-xs text-muted-foreground">{metric.label}</dt><dd className="text-xl font-semibold tabular-nums">{metric.value.toLocaleString("zh-CN")}</dd>{metric.views !== undefined && <dd className="text-xs text-muted-foreground tabular-nums">推荐播放量 {metric.views.toLocaleString("zh-CN")}</dd>}</div>)}</dl>
      <div className="flex flex-col gap-2 border-t pt-4"><div className="flex items-center justify-between gap-3 text-sm"><span>审核进度</span><span className="font-semibold tabular-nums">{summary.progress}%</span></div><Progress value={summary.progress} aria-label="本周期审核进度" className="[&_[data-slot=progress-indicator]]:bg-sidebar-primary" /><p className="text-xs text-muted-foreground tabular-nums">已审核 {summary.reviewedCount.toLocaleString("zh-CN")} / {summary.videoCount.toLocaleString("zh-CN")} 条{actor.role === "REVIEWER" ? " · 仅统计分配给你的稿件" : " · 按视频发布时间统计有效稿件"}</p></div>
    </CardContent></Card>
    {allocation && <ReviewAssignmentPanel periodId={period.id} overview={allocation} />}
  </div>;
}
