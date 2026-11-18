import Link from "next/link";
import { ArrowRight, Radio, Users, Video } from "lucide-react";
import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { chinaDateString } from "@/lib/time";
import type { SessionPayload } from "@/lib/session";
import { submissionPeriodSummary } from "@/lib/submission-period-summary";
import { getTaskCounts, listTasks } from "@/lib/opinion/client";
import { createLogger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { OverviewPanel } from "./OverviewPanel";
import PublicationChart from "./PublicationChart";
import {
  loadActivityOverview,
  loadProjectOverview,
  loadReviewOverview,
  overviewMonth,
} from "../_lib/overview";

const number = (value: number) => value.toLocaleString("zh-CN");
const compact = (value: number) =>
  new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

export async function ProjectSection({
  period,
}: {
  period: ReturnType<typeof overviewMonth>;
}) {
  const data = await loadProjectOverview(period);
  const params = new URLSearchParams({
    publishedFrom: period.from,
    publishedTo: period.to,
    keepFilters: "1",
  });
  return (
    <OverviewPanel
      title="项目数据"
      description={`${period.from.replaceAll("-", "/")} — ${period.to.replaceAll("-", "/")} · 按视频发布时间统计`}
      href={`/operator/data/videos?${params}`}
      action="视频明细"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 py-1 xl:grid-cols-4">
        {[
          { label: "发布作品", value: data.works, unit: "条" },
          { label: "发布达人", value: data.authors, unit: "人" },
          { label: "作品总播放量", value: data.views, unit: "次" },
          { label: "推荐播放量", value: data.recommended, unit: "次" },
        ].map((metric) => (
          <div key={metric.label} className="flex min-w-0 flex-col gap-2">
            <dt className="text-xs text-muted-foreground">{metric.label}</dt>
            <dd
              className="flex flex-wrap items-baseline gap-1.5"
              title={number(metric.value)}
            >
              <span className="text-2xl font-semibold tracking-tight tabular-nums 2xl:text-3xl">
                {compact(metric.value)}
              </span>
              <span className="text-xs text-muted-foreground">
                {metric.unit}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-between gap-3 pt-3">
        <h3 className="text-sm font-medium">每日发布作品</h3>
        <span className="text-xs text-muted-foreground">单位 / 条</span>
      </div>
      {data.works ? (
        <PublicationChart data={data.daily} />
      ) : (
        <div className="flex h-52 flex-col items-center justify-center gap-2 rounded-lg bg-muted/40 text-center">
          <Video className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">该月暂无有效视频</p>
          <p className="text-xs text-muted-foreground">
            选择其他月份查看发布情况。
          </p>
        </div>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        播放量为上述作品当前累计值，隐藏作品不计入。
      </p>
      <dl className="grid grid-cols-1 gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-3">
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="size-3.5" aria-hidden="true" />
            在库主播
          </dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums">
            <Link
              className="underline-offset-4 hover:underline"
              href="/operator/data/streamers"
            >
              {number(data.anchors)} 人
            </Link>
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Radio className="size-3.5" aria-hidden="true" />
            该月直播时长
          </dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums">
            <Link
              className="underline-offset-4 hover:underline"
              href={`/operator/data/live?dateFrom=${period.from}&dateTo=${period.to}&keepFilters=1`}
            >
              {number(Math.round(data.liveHours))} 小时
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">该月直播新增粉丝</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums">
            {number(data.liveFans)} 人
          </dd>
        </div>
      </dl>
    </OverviewPanel>
  );
}

export async function ReviewSection({ actor }: { actor: SessionPayload }) {
  const [data, periods] = await Promise.all([
    loadReviewOverview(actor),
    prisma.submissionPeriod.findMany({
      where: { status: "REVIEWING" },
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      take: 2,
    }),
  ]);
  const summaries = await Promise.all(
    periods.map((period) =>
      submissionPeriodSummary(
        period.startDate.toISOString().slice(0, 10),
        period.endDate.toISOString().slice(0, 10),
        actor,
      ),
    ),
  );
  const reviewed = data.approved + data.rejected;
  const progress = !data.total
    ? 0
    : reviewed === data.total
      ? 100
      : Math.min(99.9, Math.round((reviewed / data.total) * 1000) / 10);
  return (
    <OverviewPanel
      title="稿件管理"
      description="全视频库有效稿件 · 当前审核状态"
      href="/operator/submissions"
      action="统计周期"
    >
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg bg-primary/5 p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            待审核稿件
          </p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-foreground tabular-nums">
            {number(data.pending)}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              条
            </span>
          </p>
        </div>
        <Button asChild className="min-h-11">
          <Link href="/operator/submissions/review?status=PENDING&keepFilters=1">
            前往审核
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      </div>
      <dl className="grid grid-cols-3 gap-2 py-1">
        {[
          { label: "合格", value: data.approved },
          { label: "不合格", value: data.rejected },
          { label: "待审未分配", value: data.unassigned },
        ].map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {number(item.value)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2">
        <div className="flex justify-between gap-2 text-xs">
          <span className="text-muted-foreground">全库审核进度</span>
          <span className="font-medium tabular-nums">{progress}%</span>
        </div>
        <Progress value={progress} aria-label="全库审核进度" />
        <p className="text-xs text-muted-foreground">
          已审核 {number(reviewed)} / {number(data.total)} 条
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-3 pt-1">
        <h3 className="text-sm font-medium">审核中的周期</h3>
        {periods.length ? (
          periods.map((period, i) => (
            <Link
              key={period.id}
              href={`/operator/submissions/periods/${period.id}`}
              className="flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/40 motion-reduce:transition-none"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="truncate text-sm font-medium"
                  title={period.title}
                >
                  {period.title}
                </span>
                <span className="text-xs tabular-nums">
                  {summaries[i].progress}%
                </span>
              </div>
              <Progress
                value={summaries[i].progress}
                className="h-1.5"
                aria-label={`${period.title}审核进度`}
              />
              <span className="text-xs text-muted-foreground">
                {number(summaries[i].pendingCount)} 条待审核
              </span>
            </Link>
          ))
        ) : (
          <p className="py-3 text-sm text-muted-foreground">
            暂无审核中的统计周期
          </p>
        )}
      </div>
    </OverviewPanel>
  );
}

export async function ActivitySection({ now }: { now: Date }) {
  const data = await loadActivityOverview(now);
  return (
    <OverviewPanel
      title="活动管理"
      description="当前进行中的活动 · 优先展示即将结束的活动"
      href="/operator/special-activities"
      action="专题活动"
    >
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold tabular-nums">
          {data.specialCount + data.campaignCount} 个进行中
        </span>
        <span className="text-xs text-muted-foreground">
          专题 {data.specialCount} · 征稿 {data.campaignCount}
        </span>
        <Button asChild variant="link" size="sm" className="ml-auto min-h-11">
          <Link href="/operator/activities">
            征稿活动
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      </div>
      {data.items.length ? (
        <ul className="divide-y divide-border">
          {data.items.map((item) => {
            const days = Math.max(
              0,
              Math.round(
                (new Date(`${item.end}T00:00:00Z`).getTime() -
                  new Date(`${chinaDateString(now)}T00:00:00Z`).getTime()) /
                  86400000,
              ),
            );
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-3 rounded-md py-3 transition-colors hover:bg-muted/40 motion-reduce:transition-none"
                >
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="shrink-0">
                        {item.type}
                      </Badge>
                      <span
                        className="truncate text-sm font-medium"
                        title={item.title}
                      >
                        {item.title}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.start.replaceAll("-", "/")} —{" "}
                      {item.end.replaceAll("-", "/")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-xs font-medium">
                      {days ? `${days} 天后结束` : "今日结束"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.detail}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
          暂无进行中的活动
        </p>
      )}
    </OverviewPanel>
  );
}

const scopes = {
  private: "私域舆情",
  public: "公域舆情",
  combined: "对比报告",
} as const;
const statuses = {
  PENDING: "待分析",
  RUNNING: "分析中",
  DONE: "已完成",
  FAILED: "分析失败",
} as const;

export async function OpinionSection() {
  let result;
  try {
    const options = { signal: AbortSignal.timeout(3500) };
    const [counts, tasks] = await Promise.all([
      getTaskCounts(undefined, options),
      listTasks({ limit: 3, offset: 0 }, options),
    ]);
    result = { counts, tasks };
  } catch (err) {
    createLogger("dashboard").warn("概览舆情数据暂不可用", {
      event: "dashboard.opinion_unavailable",
      err,
    });
  }
  return (
    <OverviewPanel
      title="舆情监控"
      description="私域、公域与对比分析 · 最近任务"
      href="/operator/opinion/private"
      action="分析任务"
    >
      {result ? (
        <>
          <dl className="grid grid-cols-3 gap-3 rounded-lg bg-muted/40 p-3">
            {[
              { label: "已完成报告", value: result.counts.done },
              {
                label: "等待 / 分析中",
                value: result.counts.pending + result.counts.running,
              },
              { label: "分析失败", value: result.counts.failed },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">
                  {number(item.value)}
                </dd>
              </div>
            ))}
          </dl>
          {result.tasks.items.length ? (
            <ul className="divide-y divide-border">
              {result.tasks.items.map((task) => (
                <li key={task.task_id}>
                  <Link
                    href={
                      task.status === "DONE" && task.has_html
                        ? `/operator/opinion/reports/${task.task_id}/view`
                        : `/operator/opinion/${task.scope}`
                    }
                    prefetch={false}
                    className="flex items-center justify-between gap-3 rounded-md py-3 transition-colors hover:bg-muted/40 motion-reduce:transition-none"
                  >
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {task.game || "未命名分析"} · {scopes[task.scope]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmtDateTime(new Date(task.created_at))}
                      </span>
                    </div>
                    <Badge
                      variant={
                        task.status === "FAILED"
                          ? "destructive"
                          : task.status === "DONE"
                            ? "outline"
                            : "secondary"
                      }
                    >
                      {statuses[task.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex min-h-28 items-center justify-center text-sm text-muted-foreground">
              暂无分析任务
            </p>
          )}
        </>
      ) : (
        <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg bg-muted/40 px-5 text-center">
          <p className="text-sm font-medium">暂时无法读取舆情分析数据</p>
          <p className="text-xs leading-5 text-muted-foreground">
            请稍后刷新，或进入舆情监控查看服务状态。
          </p>
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {Object.entries(scopes).map(([scope, label]) => (
          <Button
            asChild
            key={scope}
            variant="outline"
            size="sm"
            className="min-h-11"
          >
            <Link href={`/operator/opinion/${scope}`}>
              {label}
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Link>
          </Button>
        ))}
      </div>
    </OverviewPanel>
  );
}
