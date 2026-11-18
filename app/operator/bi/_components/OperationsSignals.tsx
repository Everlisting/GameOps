import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarRange,
  ClipboardCheck,
  MessagesSquare,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { prisma } from "@/lib/db";
import { chinaDateStart } from "@/lib/time";
import { getTaskCounts } from "@/lib/opinion/client";
import { createLogger } from "@/lib/logger";

export function OperationsSignals() {
  return (
    <section aria-label="运营协同" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-sm font-medium">运营协同</h2>
        <p className="text-xs text-muted-foreground">
          以下为当前状态，独立于上方作品发布时间
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Suspense fallback={<SignalSkeleton />}>
          <ActivitySignal />
        </Suspense>
        <Suspense fallback={<SignalSkeleton />}>
          <PeriodSignal />
        </Suspense>
        <Suspense fallback={<SignalSkeleton />}>
          <OpinionSignal />
        </Suspense>
      </div>
    </section>
  );
}
async function ActivitySignal() {
  const today = chinaDateStart(new Date());
  const [special, campaigns] = await Promise.all([
    prisma.specialActivity.count({
      where: { startDate: { lte: today }, endDate: { gte: today } },
    }),
    prisma.activity.count({ where: { status: "ONGOING" } }),
  ]);
  return (
    <Card>
      <CardHeader className="p-3 pb-1">
        <CardTitle className="flex items-center gap-2">
          <CalendarRange
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          活动管理
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <SignalLink
            href="/operator/special-activities"
            label="进行中专题"
            value={special}
          />
          <SignalLink
            href="/operator/activities"
            label="进行中征稿"
            value={campaigns}
          />
        </div>
      </CardContent>
    </Card>
  );
}
async function PeriodSignal() {
  const [reviewing, frozen] = await Promise.all([
    prisma.submissionPeriod.count({ where: { status: "REVIEWING" } }),
    prisma.submissionPeriod.count({ where: { status: "FROZEN" } }),
  ]);
  return (
    <Card>
      <CardHeader className="p-3 pb-1">
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          审核周期
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <SignalLink
            href="/operator/submissions?status=REVIEWING&keepFilters=1"
            label="审核中"
            value={reviewing}
          />
          <SignalLink
            href="/operator/submissions?status=FROZEN&keepFilters=1"
            label="审核冻结"
            value={frozen}
          />
        </div>
      </CardContent>
    </Card>
  );
}
async function OpinionSignal() {
  let counts;
  try {
    counts = await getTaskCounts("combined", {
      signal: AbortSignal.timeout(3500),
    });
  } catch (error) {
    createLogger("bi").warn("舆情状态暂不可用", { error });
  }
  return (
    <Card>
      <CardHeader className="p-3 pb-1">
        <CardTitle className="flex items-center gap-2">
          <MessagesSquare
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          综合舆情分析
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        {counts ? (
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <SignalLink
              href="/operator/opinion/combined"
              label="已完成"
              value={counts.done}
            />
            <SignalLink
              href="/operator/opinion/combined"
              label="排队 / 分析中"
              value={counts.pending + counts.running}
            />
            <SignalLink
              href="/operator/opinion/combined"
              label="失败"
              value={counts.failed}
            />
          </div>
        ) : (
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">分析服务暂不可用</p>
            <Link
              className="text-xs underline-offset-4 hover:underline"
              href="/operator/opinion/combined"
            >
              前往查看
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
function SignalLink({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: number;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="group flex min-h-11 items-baseline gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-xl font-semibold tabular-nums">
        {value.toLocaleString("zh-CN")}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
      <ArrowUpRight
        className="size-3 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}
function SignalSkeleton() {
  return (
    <Card aria-busy="true" aria-label="正在读取运营状态">
      <CardHeader className="p-3 pb-1">
        <CardDescription>正在读取状态</CardDescription>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <Skeleton className="h-11 w-full motion-reduce:animate-none" />
      </CardContent>
    </Card>
  );
}
