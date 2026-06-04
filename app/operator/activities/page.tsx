/**
 * 运营端 · 活动管理 · 列表
 * sidebar 二级菜单通过 ?status= 过滤;按月分组,封面卡片网格。
 * 支持 ?q= ?from= ?to= 与创作者端一致(过滤 startAt)。
 */
import Link from "next/link";
import {
  CalendarClock,
  CalendarRange,
  ClipboardList,
  Plus,
  Users,
} from "lucide-react";
import type { Prisma, ActivityStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ActivityBadge } from "@/app/(creator)/_components/StatusBadge";
import ActivityCover from "@/app/(creator)/_components/ActivityCover";
import { autoPublishDue } from "@/lib/activity-publish";
import ActivitiesListFilters from "./_components/ActivitiesListFilters";

const STATUS_VALUES: ActivityStatus[] = ["DRAFT", "ONGOING", "ENDED"];

function parseDateBound(s: string | undefined, end: boolean): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return null;
  if (end) date.setHours(23, 59, 59, 999);
  return date;
}

type ActivityCardData = {
  id: string;
  name: string;
  description: string | null;
  coverImage: string | null;
  status: ActivityStatus;
  startAt: Date;
  endAt: Date;
  publishAt: Date | null;
  createdAt: Date;
  _count: { submissions: number; enrollments: number };
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function groupByMonth(items: ActivityCardData[]) {
  const map = new Map<string, ActivityCardData[]>();
  for (const a of items) {
    const k = monthKey(a.startAt);
    const bucket = map.get(k);
    if (bucket) bucket.push(a);
    else map.set(k, [a]);
  }
  return Array.from(map.entries()).map(([key, list]) => {
    const [y, m] = key.split("-");
    return { key, label: `${y} 年 ${Number(m)} 月`, items: list };
  });
}

export default async function OperatorActivitiesPage({
  searchParams,
}: {
  searchParams?: { status?: string; q?: string; from?: string; to?: string };
}) {
  await requireRole("OPERATOR");

  // 读时懒触发定时发布(阶段 4 接入 cron 后可拆掉)
  await autoPublishDue();

  const status = STATUS_VALUES.includes(searchParams?.status as ActivityStatus)
    ? (searchParams!.status as ActivityStatus)
    : undefined;
  const q = searchParams?.q?.trim() ?? "";
  const fromDate = parseDateBound(searchParams?.from, false);
  const toDate = parseDateBound(searchParams?.to, true);

  const where: Prisma.ActivityWhereInput = {};
  if (status) where.status = status;
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (fromDate || toDate) {
    where.startAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  const activities = await prisma.activity.findMany({
    where,
    orderBy: { startAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      coverImage: true,
      status: true,
      startAt: true,
      endAt: true,
      publishAt: true,
      createdAt: true,
      _count: { select: { submissions: true, enrollments: true } },
    },
  });

  const groups = groupByMonth(activities);

  const heading =
    status === "DRAFT"
      ? "草稿活动"
      : status === "ONGOING"
        ? "进行中的活动"
        : status === "ENDED"
          ? "已结束的活动"
          : "全部活动";

  return (
    <div className="p-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            创建活动、配置激励规则、推动活动状态流转。
          </p>
        </div>
        <Button asChild>
          <Link href="/operator/activities/new">
            <Plus className="size-4" />
            新建活动
          </Link>
        </Button>
      </header>

      <Card className="mb-5 p-4">
        <ActivitiesListFilters />
        <p className="mt-3 text-xs text-muted-foreground">
          共 {activities.length} 个活动
        </p>
      </Card>

      {activities.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          {q ? `没有匹配 "${q}" 的活动。` : "暂无活动,点右上角新建一个。"}
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2">
                <h2 className="text-sm font-medium">{g.label}</h2>
                <span className="text-xs text-muted-foreground">
                  共 {g.items.length} 个活动
                </span>
              </div>
              <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {g.items.map((a) => (
                  <ActivityCard key={a.id} activity={a} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityCard({ activity: a }: { activity: ActivityCardData }) {
  return (
    <li>
      <Link
        href={`/operator/activities/${a.id}`}
        className="group block focus:outline-none"
      >
        <Card className="flex h-full flex-col overflow-hidden p-0 transition-shadow hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring/50">
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            <ActivityCover
              src={a.coverImage}
              name={a.name}
              className="transition-transform duration-500 group-hover:scale-105"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
            <div className="absolute left-2 top-2">
              <ActivityBadge status={a.status} />
            </div>
            {a.status === "DRAFT" && a.publishAt && (
              <div
                className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-0.5 text-[10px] text-zinc-100 backdrop-blur"
                title={`将于 ${fmtDateTime(a.publishAt)} 自动发布`}
              >
                <CalendarClock className="size-3" />
                定时发布
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-3 p-4">
            <div className="min-w-0">
              <h3 className="line-clamp-1 text-sm font-medium transition-colors group-hover:text-primary">
                {a.name}
              </h3>
              {/* 始终占两行高度,空描述也保留空行,保证同一行各卡片高度一致 */}
              <p className="mt-1 line-clamp-2 h-8 text-xs leading-4 text-muted-foreground">
                {a.description || " "}
              </p>
            </div>
            <div className="mt-auto space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarRange className="size-3.5" />
                <span className="truncate">
                  {fmtDate(a.startAt)} ~ {fmtDate(a.endAt)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5" />
                  <span className="tabular-nums">{a._count.enrollments}</span>
                  <span>报名</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <ClipboardList className="size-3.5" />
                  <span className="tabular-nums">{a._count.submissions}</span>
                  <span>投稿</span>
                </span>
              </div>
            </div>
          </div>
        </Card>
      </Link>
    </li>
  );
}
