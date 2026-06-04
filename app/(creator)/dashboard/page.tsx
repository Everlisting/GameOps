/**
 * 创作者端 · 概览
 * 统计卡片 + 最近投稿。所有数据基于当前创作者。
 */
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/creator";
import { fmtDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmissionBadge } from "../_components/StatusBadge";

export default async function CreatorOverview() {
  const { creator } = await requireCreator();

  const [
    enrollmentCount,
    pendingCount,
    approvedCount,
    rejectedCount,
    recent,
    ongoing,
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
  ]);

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">概览</h1>
        <p className="text-sm text-muted-foreground mt-1">
          欢迎,{creator.nickname}。这里汇总你的报名与投稿状态。
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="已报名活动" value={enrollmentCount} />
        <Stat label="待审核" value={pendingCount} tone="warn" />
        <Stat label="已通过" value={approvedCount} tone="ok" />
        <Stat label="未通过" value={rejectedCount} tone="bad" />
      </section>

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
