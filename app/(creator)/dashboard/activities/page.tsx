/**
 * 创作者端 · 活动列表(图片卡片网格,按月分组)
 * 默认列出 ONGOING + ENDED;支持 ?status= / ?enrolled=1 / ?q= / ?from= / ?to= 过滤。
 * 右侧侧栏由 /dashboard/layout.tsx 统一渲染。
 */
import Link from "next/link";
import { ArrowRight, BadgeCheck, Users, FileText } from "lucide-react";
import type { Prisma, ActivityStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/creator";
import { fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ActivityBadge } from "../../_components/StatusBadge";
import ActivityCover from "../../_components/ActivityCover";
import ActivityFilters from "../../_components/ActivityFilters";

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
  _count: { submissions: number; enrollments: number };
  enrollments: { id: string }[];
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

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams?: {
    status?: string;
    enrolled?: string;
    q?: string;
    from?: string;
    to?: string;
  };
}) {
  const { creator } = await requireCreator();

  const statusFilter = STATUS_VALUES.includes(searchParams?.status as ActivityStatus)
    ? (searchParams!.status as ActivityStatus)
    : undefined;
  const onlyEnrolled = searchParams?.enrolled === "1";
  const q = searchParams?.q?.trim() ?? "";
  const fromDate = parseDateBound(searchParams?.from, false);
  const toDate = parseDateBound(searchParams?.to, true);

  const where: Prisma.ActivityWhereInput = statusFilter
    ? { status: statusFilter }
    : { status: { in: ["ONGOING", "ENDED"] } };
  if (onlyEnrolled) {
    where.enrollments = { some: { creatorId: creator.id } };
  }
  if (q) {
    where.name = { contains: q, mode: "insensitive" };
  }
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
      _count: { select: { submissions: true, enrollments: true } },
      enrollments: {
        where: { creatorId: creator.id },
        select: { id: true },
        take: 1,
      },
    },
  });

  const groups = groupByMonth(activities);

  const heading = onlyEnrolled
    ? "已参加的活动"
    : statusFilter === "ONGOING"
      ? "进行中的活动"
      : statusFilter === "ENDED"
        ? "已结束的活动"
        : "活动";

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">{heading}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          参与进行中的活动并投稿,或回看已结束的活动。
        </p>
      </header>

      <ActivityFilters />

      {activities.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          暂无符合条件的活动。
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
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
  const enrolled = a.enrollments.length > 0;
  return (
    <li>
      <Link href={`/dashboard/activities/${a.id}`} className="group block">
        <Card className="overflow-hidden transition-colors hover:border-emerald-500/50">
          <div className="relative aspect-[16/9] overflow-hidden bg-zinc-900">
            <ActivityCover
              src={a.coverImage}
              name={a.name}
              className="transition-transform duration-500 group-hover:scale-105"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <ActivityBadge status={a.status} />
              {enrolled && (
                <Badge variant="success">
                  <BadgeCheck className="size-3" />
                  已报名
                </Badge>
              )}
            </div>
            <div className="absolute bottom-3 right-3 inline-flex size-7 items-center justify-center rounded-full bg-black/55 text-zinc-200 backdrop-blur opacity-0 transition-opacity group-hover:opacity-100">
              <ArrowRight className="size-4" />
            </div>
          </div>

          <div className="p-4">
            <h3 className="text-sm font-semibold leading-snug line-clamp-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors">
              {a.name}
            </h3>
            {a.description && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2 min-h-[2.25rem]">
                {a.description}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {fmtDate(a.startAt)} ~ {fmtDate(a.endAt)}
              </span>
              <span className="inline-flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3" />
                  {a._count.enrollments}
                </span>
                <span className="inline-flex items-center gap-1">
                  <FileText className="size-3" />
                  {a._count.submissions}
                </span>
              </span>
            </div>
          </div>
        </Card>
      </Link>
    </li>
  );
}
