/**
 * 创作者端 · 概览
 * 统计卡片 + 最近投稿。所有数据基于当前创作者。
 */
import Link from "next/link";
import { Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/creator";
import { fmtDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubmissionBadge } from "../_components/StatusBadge";
import { incentiveDb } from "@/lib/incentive/db";

export default async function CreatorOverview() {
  const { creator } = await requireCreator();

  const [
    enrollmentCount,
    pendingCount,
    approvedCount,
    rejectedCount,
    recent,
    ongoing,
    incentives,
  ] = await Promise.all([
    prisma.activityEnrollment.count({ where: { creatorId: creator.id } }),
    prisma.submission.count({ where: { creatorId: creator.id, status: "PENDING" } }),
    prisma.submission.count({ where: { creatorId: creator.id, status: "APPROVED" } }),
    prisma.submission.count({ where: { creatorId: creator.id, status: "REJECTED" } }),
    prisma.submission.findMany({
      where: { creatorId: creator.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        title: true,
        platform: true,
        status: true,
        createdAt: true,
        activity: { select: { id: true, name: true } },
      },
    }),
    prisma.activity.findMany({
      where: { status: "ONGOING" },
      orderBy: { startAt: "desc" },
      take: 4,
      select: {
        id: true,
        name: true,
        startAt: true,
        endAt: true,
        enrollments: {
          where: { creatorId: creator.id },
          select: { id: true },
          take: 1,
        },
        _count: { select: { enrollments: true, submissions: true } },
      },
    }),
    incentiveDb.findMany({
      where: { creatorId: creator.id },
      orderBy: { computedAt: "desc" },
    }),
  ]);

  // 阶段5 · 把激励行 + 活动名拼成 UI 列表;按 final 倒序取前 5 展示
  const incentiveActivityIds = Array.from(
    new Set(incentives.map((i) => i.activityId)),
  );
  const incentiveActivities = incentiveActivityIds.length
    ? await prisma.activity.findMany({
        where: { id: { in: incentiveActivityIds } },
        select: { id: true, name: true, status: true },
      })
    : [];
  const actMap = new Map(incentiveActivities.map((a) => [a.id, a]));

  const incentiveItems = incentives
    .map((i) => {
      const est = Number(i.estimated);
      const adj = i.adjusted == null ? null : Number(i.adjusted);
      return {
        id: i.id,
        activityId: i.activityId,
        activityName: actMap.get(i.activityId)?.name ?? "(已删除活动)",
        activityStatus: actMap.get(i.activityId)?.status ?? null,
        estimated: est,
        adjusted: adj,
        final: adj ?? est,
        adjustedAt: i.adjustedAt,
      };
    })
    .sort((a, b) => b.final - a.final);

  const incentiveTotal = incentiveItems.reduce((s, x) => s + x.final, 0);
  const incentiveTopItems = incentiveItems.slice(0, 5);

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">概览</h1>
        <p className="text-sm text-muted-foreground mt-1">
          欢迎,{creator.nickname}。这里汇总你的报名与投稿状态。
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="已报名活动" value={enrollmentCount} />
        <Stat label="待审核" value={pendingCount} tone="warn" />
        <Stat label="已通过" value={approvedCount} tone="ok" />
        <Stat label="未通过" value={rejectedCount} tone="bad" />
      </section>

      {incentiveItems.length > 0 && (
        <Card className="mb-8 p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Wallet className="size-4 text-emerald-600 dark:text-emerald-300" />
                我的预估激励
              </div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">
                ¥ {incentiveTotal.toFixed(2)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                共 {incentiveItems.length} 个活动 · 以最终结算为准
              </div>
            </div>
            <Link
              href="/dashboard/activities"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              查看活动 →
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {incentiveTopItems.map((it) => (
              <li
                key={it.id}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <Link
                  href={`/dashboard/activities/${it.activityId}`}
                  className="min-w-0 flex-1 truncate text-sm hover:text-primary"
                >
                  {it.activityName}
                </Link>
                <div className="flex items-center gap-2 text-right">
                  {it.adjusted != null && (
                    <Badge variant="muted" className="text-[10px]">
                      已调整
                    </Badge>
                  )}
                  <span className="text-sm font-medium tabular-nums">
                    ¥ {it.final.toFixed(2)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">最近投稿</h2>
            <Link
              href="/dashboard/submissions?status=all"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              查看全部 →
            </Link>
          </div>
          {recent.length === 0 ? (
            <EmptyState text="还没有投稿,去活动页投出第一篇吧。" />
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {recent.map((s) => (
                  <li
                    key={s.id}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm truncate">{s.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {s.platform}
                        {s.activity ? ` · ${s.activity.name}` : ""} ·{" "}
                        {fmtDateTime(s.createdAt)}
                      </div>
                    </div>
                    <SubmissionBadge status={s.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">进行中的活动</h2>
            <Link
              href="/dashboard/activities?status=ONGOING"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              更多 →
            </Link>
          </div>
          {ongoing.length === 0 ? (
            <EmptyState text="暂无进行中的活动。" />
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {ongoing.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/dashboard/activities/${a.id}`}
                      className="block px-4 py-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium truncate">{a.name}</div>
                        {a.enrollments.length > 0 && (
                          <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                            已报名
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {fmtDateTime(a.startAt)} 截止 {fmtDateTime(a.endAt)}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {a._count.enrollments} 人报名 · {a._count.submissions} 篇投稿
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "bad";
}) {
  const toneCls =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-300"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-300"
        : tone === "bad"
          ? "text-red-600 dark:text-red-300"
          : "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"mt-1 text-2xl font-semibold " + toneCls}>{value}</div>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
      {text}
    </Card>
  );
}
