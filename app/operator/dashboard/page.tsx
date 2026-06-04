/**
 * 运营端 · 概览
 * 顶部:5 张统计卡(待审稿件 / 待审创作者 / 进行中活动 / 本月报名 / 本月投稿)
 * 主体:左大列(待审稿件 + 最近审核动作)+ 右小列(待审创作者 + 进行中活动)
 */
import Link from "next/link";
import { ArrowRight, CalendarRange, ClipboardCheck, Send, UserCheck, Users } from "lucide-react";
import { endOfMonth, startOfMonth } from "date-fns";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { CreatorAvatar } from "@/components/creator-avatar";
import {
  ActivityBadge,
  SubmissionBadge,
} from "@/app/(creator)/_components/StatusBadge";
import { ReviewPill } from "../submissions/_components/StatusPill";
import { AccountStatusBadge } from "../creators/_components/AccountStatusBadge";

export default async function OperatorOverview() {
  const session = await requireRole("OPERATOR");

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [
    pendingSubmissionsCount,
    pendingCreatorsCount,
    ongoingActivitiesCount,
    monthEnrollments,
    monthSubmissions,
    recentPending,
    recentReviewed,
    pendingCreatorsList,
    ongoingActivities,
  ] = await Promise.all([
    prisma.submission.count({ where: { status: "PENDING" } }),
    prisma.creator.count({ where: { user: { status: "pending" } } }),
    prisma.activity.count({ where: { status: "ONGOING" } }),
    prisma.activityEnrollment.count({
      where: { createdAt: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.submission.count({
      where: { createdAt: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.submission.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        title: true,
        platform: true,
        titleStatus: true,
        contentStatus: true,
        yishanStatus: true,
        createdAt: true,
        creator: { select: { id: true, nickname: true, avatarUrl: true } },
        activity: { select: { id: true, name: true } },
      },
    }),
    prisma.submission.findMany({
      where: { status: { in: ["APPROVED", "REJECTED"] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        creator: { select: { nickname: true } },
      },
    }),
    prisma.creator.findMany({
      where: { user: { status: "pending" } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        createdAt: true,
        user: { select: { username: true, status: true } },
      },
    }),
    prisma.activity.findMany({
      where: { status: "ONGOING" },
      orderBy: { endAt: "asc" },
      take: 4,
      select: {
        id: true,
        name: true,
        status: true,
        startAt: true,
        endAt: true,
        _count: { select: { enrollments: true, submissions: true } },
      },
    }),
  ]);

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">概览</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          欢迎,{session.username}。这里是当前需要跟进的关键指标。
        </p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard
          label="待审稿件"
          value={pendingSubmissionsCount}
          icon={ClipboardCheck}
          tone="amber"
          href="/operator/submissions?status=PENDING"
        />
        <StatCard
          label="待审创作者"
          value={pendingCreatorsCount}
          icon={UserCheck}
          tone="orange"
          href="/operator/creators?status=pending"
        />
        <StatCard
          label="进行中活动"
          value={ongoingActivitiesCount}
          icon={CalendarRange}
          tone="emerald"
          href="/operator/activities?status=ONGOING"
        />
        <StatCard
          label="本月报名"
          value={monthEnrollments}
          icon={Users}
          tone="sky"
        />
        <StatCard
          label="本月投稿"
          value={monthSubmissions}
          icon={Send}
          tone="violet"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="space-y-6 lg:col-span-3">
          <Block
            title="待审稿件"
            href="/operator/submissions?status=PENDING"
            empty={recentPending.length === 0}
            emptyText="没有待审稿件,休息一下。"
          >
            <ul className="divide-y divide-border">
              {recentPending.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/operator/submissions/${s.id}`}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <CreatorAvatar
                      avatar={s.creator.avatarUrl}
                      name={s.creator.nickname}
                      className="size-8 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-1 text-sm font-medium">
                        {s.title}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        @{s.creator.nickname} · {s.platform}
                        {s.activity ? ` · ${s.activity.name}` : ""} ·{" "}
                        {fmtDateTime(s.createdAt)}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                      <ReviewPill status={s.titleStatus} label="标" />
                      <ReviewPill status={s.contentStatus} label="内" />
                      <ReviewPill status={s.yishanStatus} label="易" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Block>

          <Block
            title="最近审核动作"
            href="/operator/submissions"
            empty={recentReviewed.length === 0}
            emptyText="还没有审核记录。"
          >
            <ul className="divide-y divide-border">
              {recentReviewed.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/operator/submissions/${s.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <div className="line-clamp-1 text-sm">{s.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        @{s.creator.nickname} · {fmtDateTime(s.updatedAt)}
                      </div>
                    </div>
                    <SubmissionBadge status={s.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </Block>
        </section>

        <section className="space-y-6 lg:col-span-2">
          <Block
            title="待审创作者"
            href="/operator/creators?status=pending"
            empty={pendingCreatorsList.length === 0}
            emptyText="暂无待审注册。"
          >
            <ul className="divide-y divide-border">
              {pendingCreatorsList.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/operator/creators/${c.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <CreatorAvatar
                      avatar={c.avatarUrl}
                      name={c.nickname}
                      className="size-8 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-1 text-sm font-medium">
                        {c.nickname}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        @{c.user.username} · {fmtDate(c.createdAt)}
                      </div>
                    </div>
                    <AccountStatusBadge status={c.user.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </Block>

          <Block
            title="进行中活动"
            href="/operator/activities?status=ONGOING"
            empty={ongoingActivities.length === 0}
            emptyText="没有进行中的活动。"
          >
            <ul className="divide-y divide-border">
              {ongoingActivities.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/operator/activities/${a.id}`}
                    className="block px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="line-clamp-1 text-sm font-medium">
                        {a.name}
                      </span>
                      <ActivityBadge status={a.status} />
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {fmtDate(a.startAt)} ~ {fmtDate(a.endAt)}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {a._count.enrollments} 人报名 · {a._count.submissions} 篇投稿
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Block>
        </section>
      </div>
    </div>
  );
}

const TONES = {
  amber: {
    iconBg: "bg-amber-500 text-white",
    cardBg: "bg-amber-50 dark:bg-amber-950/30",
  },
  orange: {
    iconBg: "bg-orange-500 text-white",
    cardBg: "bg-orange-50 dark:bg-orange-950/30",
  },
  emerald: {
    iconBg: "bg-emerald-500 text-white",
    cardBg: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  sky: {
    iconBg: "bg-sky-500 text-white",
    cardBg: "bg-sky-50 dark:bg-sky-950/30",
  },
  violet: {
    iconBg: "bg-violet-500 text-white",
    cardBg: "bg-violet-50 dark:bg-violet-950/30",
  },
} as const;

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TONES;
  href?: string;
}) {
  const t = TONES[tone];
  const inner = (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg p-4 ${t.cardBg}`}
    >
      <div className="min-w-0">
        <div className="truncate text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      </div>
      <span
        className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full ${t.iconBg}`}
      >
        <Icon className="size-4" />
      </span>
    </div>
  );
  if (href)
    return (
      <Link
        href={href}
        className="transition-transform hover:-translate-y-0.5"
      >
        {inner}
      </Link>
    );
  return inner;
}

function Block({
  title,
  href,
  children,
  empty,
  emptyText,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">{title}</h2>
        {href && (
          <Link
            href={href}
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            查看全部 <ArrowRight className="size-3" />
          </Link>
        )}
      </div>
      {empty ? (
        <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
          {emptyText ?? "暂无数据"}
        </Card>
      ) : (
        <Card className="overflow-hidden">{children}</Card>
      )}
    </div>
  );
}
