/**
 * 创作者端 · 我的投稿
 * - 主体:投稿按"挂载活动"分组(每组一张可折叠卡片),再按活动月份分段渲染。
 * - 默认 / ?status=all(全部投稿):支持 ?q= 搜索 + ?from=&to= 日期范围。
 * - ?status=PENDING|APPROVED|REJECTED:不显示日期 UI,强制限定为当月范围。
 * 日期语义:挂活动的稿件按 activity.startAt 落入范围;未挂活动的稿件按 submission.createdAt。
 */
import type { ActivityStatus, Prisma, SubmissionStatus } from "@prisma/client";
import { endOfMonth, startOfMonth } from "date-fns";
import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/creator";
import { fmtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarRange,
  ChevronRight,
  FileText,
  Inbox,
} from "lucide-react";
import { ActivityBadge, SubmissionBadge } from "../../_components/StatusBadge";
import SubmissionFilters from "../../_components/SubmissionFilters";

const STATUS_VALUES: SubmissionStatus[] = ["PENDING", "APPROVED", "REJECTED"];

const HEADING: Record<SubmissionStatus, string> = {
  PENDING: "待审核的投稿",
  APPROVED: "已通过的投稿",
  REJECTED: "未通过的投稿",
};

type SubmissionActivity = {
  id: string;
  name: string;
  status: ActivityStatus;
  startAt: Date;
};

type SubmissionItem = {
  id: string;
  title: string;
  url: string;
  platform: string;
  status: SubmissionStatus;
  reviewNote: string | null;
  createdAt: Date;
  activity: SubmissionActivity | null;
};

type SubmissionGroup = {
  key: string;
  activity: SubmissionActivity | null;
  /** 该分组的"代表日期",用来做月份分桶。挂活动用 activity.startAt,否则用最新稿件时间。 */
  groupDate: Date;
  items: SubmissionItem[];
  counts: Record<SubmissionStatus, number>;
};

type MonthBucket = {
  key: string;
  label: string;
  groups: SubmissionGroup[];
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d: Date) {
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
}

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

function groupByActivity(items: SubmissionItem[]): SubmissionGroup[] {
  const map = new Map<string, SubmissionGroup>();
  for (const s of items) {
    const key = s.activity?.id ?? "__none__";
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        activity: s.activity,
        groupDate: s.activity?.startAt ?? s.createdAt,
        items: [],
        counts: { PENDING: 0, APPROVED: 0, REJECTED: 0 },
      };
      map.set(key, g);
    }
    g.items.push(s);
    g.counts[s.status] += 1;
  }
  // 同月内:挂活动的优先,然后按代表日期倒序
  return Array.from(map.values()).sort((a, b) => {
    if (a.activity && !b.activity) return -1;
    if (!a.activity && b.activity) return 1;
    return b.groupDate.getTime() - a.groupDate.getTime();
  });
}

function bucketByMonth(groups: SubmissionGroup[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>();
  // groups 已按代表日期倒序;借此让 map 插入顺序天然从新到旧
  for (const g of groups) {
    const k = monthKey(g.groupDate);
    let bucket = map.get(k);
    if (!bucket) {
      bucket = { key: k, label: monthLabel(g.groupDate), groups: [] };
      map.set(k, bucket);
    }
    bucket.groups.push(g);
  }
  return Array.from(map.values());
}

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams?: { status?: string; q?: string; from?: string; to?: string };
}) {
  const { creator } = await requireCreator();

  const statusFilter = STATUS_VALUES.includes(searchParams?.status as SubmissionStatus)
    ? (searchParams!.status as SubmissionStatus)
    : undefined;
  const q = searchParams?.q?.trim() ?? "";

  // 状态过滤页强制当月;全部投稿读 URL。
  const showDateFilter = !statusFilter;
  let fromDate: Date | null;
  let toDate: Date | null;
  if (statusFilter) {
    const now = new Date();
    fromDate = startOfMonth(now);
    toDate = endOfMonth(now);
  } else {
    fromDate = parseDateBound(searchParams?.from, false);
    toDate = parseDateBound(searchParams?.to, true);
  }

  const conditions: Prisma.SubmissionWhereInput[] = [{ creatorId: creator.id }];
  if (statusFilter) conditions.push({ status: statusFilter });
  if (q) {
    conditions.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { activity: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (fromDate || toDate) {
    const range = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
    conditions.push({
      OR: [
        { activity: { startAt: range } },
        { AND: [{ activityId: null }, { createdAt: range }] },
      ],
    });
  }

  const submissions = await prisma.submission.findMany({
    where: { AND: conditions },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      url: true,
      platform: true,
      status: true,
      reviewNote: true,
      createdAt: true,
      activity: {
        select: { id: true, name: true, status: true, startAt: true },
      },
    },
  });

  const groups = groupByActivity(submissions);
  const months = bucketByMonth(groups);
  const heading = statusFilter ? HEADING[statusFilter] : "我的投稿";

  const description = statusFilter
    ? `仅显示本月(${monthLabel(new Date())})的活动和稿件。`
    : "提交作品链接,运营审核后状态会更新到这里。";

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">{heading}</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </header>

      <Card className="mb-5 p-4">
        <SubmissionFilters showDateFilter={showDateFilter} />
      </Card>

      <section className="space-y-5">
        <h2 className="text-sm font-medium text-muted-foreground">
          按活动汇总 · {groups.length} 个分组 · {submissions.length} 篇稿件
        </h2>
        {months.length === 0 ? (
          <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
            {q ? `没有匹配 "${q}" 的投稿。` : "没有符合条件的投稿。"}
          </Card>
        ) : (
          months.map((m) => (
            <section key={m.key} className="space-y-3">
              <div className="flex items-baseline justify-between border-b border-border pb-2">
                <h3 className="text-sm font-medium">{m.label}</h3>
                <span className="text-xs text-muted-foreground">
                  共 {m.groups.length} 个活动
                </span>
              </div>
              <div className="space-y-3">
                {m.groups.map((g) => (
                  <ActivityGroupCard
                    key={g.key}
                    group={g}
                    showCounts={!statusFilter}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </section>
    </div>
  );
}

function ActivityGroupCard({
  group,
  showCounts,
}: {
  group: SubmissionGroup;
  showCounts: boolean;
}) {
  const { activity, items, counts } = group;
  const title = activity?.name ?? "未挂活动的独立投稿";

  return (
    <Card className="overflow-hidden p-0">
      <Collapsible>
        <div className="flex items-stretch has-[[data-state=open]]:border-b has-[[data-state=open]]:border-border">
          <CollapsibleTrigger className="group flex flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 data-open:bg-muted/30">
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium truncate">{title}</span>
                {activity && <ActivityBadge status={activity.status} />}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                {activity && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarRange className="size-3" />
                    {monthLabel(activity.startAt)}
                  </span>
                )}
                <span>{items.length} 篇稿件</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {showCounts ? (
                <>
                  {counts.PENDING > 0 && (
                    <Badge variant="warning">待审 {counts.PENDING}</Badge>
                  )}
                  {counts.APPROVED > 0 && (
                    <Badge variant="success">已通过 {counts.APPROVED}</Badge>
                  )}
                  {counts.REJECTED > 0 && (
                    <Badge variant="destructive">未通过 {counts.REJECTED}</Badge>
                  )}
                </>
              ) : (
                <Badge variant="muted">{items.length}</Badge>
              )}
            </div>
          </CollapsibleTrigger>
          {activity && (
            <Link
              href={`/dashboard/activities/${activity.id}`}
              className="flex items-center gap-1 border-l border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <ArrowUpRight className="size-3.5" />
              查看活动
            </Link>
          )}
        </div>
        <CollapsibleContent>
          {items.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <Inbox className="size-4" />
              该活动下还没有稿件。
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((s) => (
                <li
                  key={s.id}
                  className="px-4 py-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm hover:text-primary truncate max-w-full"
                    >
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{s.title}</span>
                    </a>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {s.platform} · {fmtDateTime(s.createdAt)}
                    </div>
                    {s.reviewNote && (
                      <div className="text-xs text-muted-foreground mt-1">
                        审核备注:{s.reviewNote}
                      </div>
                    )}
                  </div>
                  <SubmissionBadge status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
