/**
 * 运营端 · 稿件管理
 * 双视图:
 *   - 默认:按活动汇总的卡片网格(按活动 startAt 分月),每张卡片展示该活动三态稿件计数。
 *   - ?activityId= 设置时:进入该活动的稿件审核表格(沿用 SubmissionsTable + 批量审核)。
 * 共用 ?status= / ?q= / ?from= / ?to= / ?platform= 过滤。
 * 分页 ?page=&pageSize= 仅在表格视图下生效。
 */
import type { Prisma, SubmissionStatus } from "@prisma/client";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Upload,
} from "lucide-react";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import SubmissionsTable, {
  type SubmissionRow,
} from "./_components/SubmissionsTable";
import SubmissionsListFilters from "./_components/SubmissionsListFilters";
import ActivitySubmissionsCard, {
  type ActivitySubmissionsCardData,
  type SubmissionCounts,
} from "./_components/ActivitySubmissionsCard";

const STATUS_VALUES: SubmissionStatus[] = ["PENDING", "APPROVED", "REJECTED"];

const STATUS_HEADING: Record<SubmissionStatus, string> = {
  PENDING: "待审核稿件",
  APPROVED: "已通过稿件",
  REJECTED: "未通过稿件",
};

function clampPage(raw: string | undefined, fallback = 1) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
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

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const NO_ACTIVITY_KEY = "__none__";

export default async function OperatorSubmissionsPage({
  searchParams,
}: {
  searchParams?: {
    status?: string;
    q?: string;
    platform?: string;
    activityId?: string;
    from?: string;
    to?: string;
    page?: string;
    pageSize?: string;
  };
}) {
  await requireRole("OPERATOR");

  const status = STATUS_VALUES.includes(searchParams?.status as SubmissionStatus)
    ? (searchParams!.status as SubmissionStatus)
    : undefined;
  const q = searchParams?.q?.trim() ?? "";
  const platform = searchParams?.platform?.trim() ?? "";
  const activityId = searchParams?.activityId ?? "";
  const fromDate = parseDateBound(searchParams?.from, false);
  const toDate = parseDateBound(searchParams?.to, true);

  const heading = status ? STATUS_HEADING[status] : "全部稿件";

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            按活动汇总;点击卡片进入对应活动的审核工作台。
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/operator/submissions/import-yishan">
            <Upload className="size-4" />
            导入易闪结果
          </Link>
        </Button>
      </header>

      {activityId ? (
        <TableView
          activityId={activityId}
          status={status}
          q={q}
          platform={platform}
          fromDate={fromDate}
          toDate={toDate}
          page={clampPage(searchParams?.page, 1)}
          pageSize={Math.min(clampPage(searchParams?.pageSize, 50), 200)}
          searchParams={searchParams ?? {}}
        />
      ) : (
        <CardsView
          status={status}
          q={q}
          fromDate={fromDate}
          toDate={toDate}
          searchParams={searchParams ?? {}}
        />
      )}
    </div>
  );
}

// ── 视图一:活动汇总卡片 ─────────────────────────────────
async function CardsView({
  status,
  q,
  fromDate,
  toDate,
  searchParams,
}: {
  status: SubmissionStatus | undefined;
  q: string;
  fromDate: Date | null;
  toDate: Date | null;
  searchParams: Record<string, string | undefined>;
}) {
  // 时间 + 搜索 同时作用在 groupBy(状态 sidebar 决定哪些活动展示,不削减计数)
  const baseSubmissionWhere: Prisma.SubmissionWhereInput = {};
  if (fromDate || toDate) {
    baseSubmissionWhere.createdAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }
  if (q) {
    // 汇总视图只按活动名 + 抖音昵称/抖音号/易闪 ID 命中(标题/团号/创作者昵称属于稿件粒度,留给表格视图)
    baseSubmissionWhere.OR = [
      { activity: { name: { contains: q, mode: "insensitive" } } },
      {
        creator: {
          OR: [
            { dyName: { contains: q, mode: "insensitive" } },
            { dyAccount: { contains: q, mode: "insensitive" } },
            { ysId: { contains: q, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  const groups = await prisma.submission.groupBy({
    by: ["activityId", "status"],
    where: baseSubmissionWhere,
    _count: { _all: true },
  });

  // 聚合到 { activityId | "__none__" → { PENDING, APPROVED, REJECTED } }
  const countsByActivity = new Map<string, SubmissionCounts>();
  for (const g of groups) {
    const key = g.activityId ?? NO_ACTIVITY_KEY;
    if (!countsByActivity.has(key)) {
      countsByActivity.set(key, { PENDING: 0, APPROVED: 0, REJECTED: 0 });
    }
    countsByActivity.get(key)![g.status] = g._count._all;
  }

  // sidebar 选中状态时,只展示该状态计数 > 0 的活动
  const visibleKeys = [...countsByActivity.entries()]
    .filter(([, counts]) => (status ? counts[status] > 0 : true))
    .map(([key]) => key);

  // 拉活动元数据
  const realIds = visibleKeys.filter((k) => k !== NO_ACTIVITY_KEY);
  const activities = realIds.length
    ? await prisma.activity.findMany({
        where: { id: { in: realIds } },
        select: {
          id: true,
          name: true,
          coverImage: true,
          status: true,
          startAt: true,
          endAt: true,
        },
      })
    : [];
  const activityById = new Map(activities.map((a) => [a.id, a]));

  // 组装卡片数据
  const cards: ActivitySubmissionsCardData[] = visibleKeys.map((key) => {
    if (key === NO_ACTIVITY_KEY) {
      return {
        id: null,
        name: "未关联活动的稿件",
        coverImage: null,
        status: null,
        startAt: null,
        endAt: null,
        counts: countsByActivity.get(key)!,
      };
    }
    const a = activityById.get(key);
    return {
      id: key,
      name: a?.name ?? "(活动已删除)",
      coverImage: a?.coverImage ?? null,
      status: a?.status ?? null,
      startAt: a?.startAt ?? null,
      endAt: a?.endAt ?? null,
      counts: countsByActivity.get(key)!,
    };
  });

  // 排序:有活动的按 startAt desc;无活动的桶最末
  cards.sort((a, b) => {
    if (!a.startAt && !b.startAt) return 0;
    if (!a.startAt) return 1;
    if (!b.startAt) return -1;
    return b.startAt.getTime() - a.startAt.getTime();
  });

  const totalSubmissions = cards.reduce(
    (n, c) => n + c.counts.PENDING + c.counts.APPROVED + c.counts.REJECTED,
    0,
  );

  // 分月分组:按 startAt 月份;无活动的桶单独一个 section
  type Group = {
    key: string;
    label: string;
    items: ActivitySubmissionsCardData[];
  };
  const monthGroups: Group[] = [];
  let unattached: Group | null = null;
  for (const c of cards) {
    if (!c.startAt) {
      if (!unattached) {
        unattached = { key: "__unattached__", label: "未关联活动", items: [] };
      }
      unattached.items.push(c);
      continue;
    }
    const k = monthKey(c.startAt);
    let bucket = monthGroups.find((g) => g.key === k);
    if (!bucket) {
      const [y, m] = k.split("-");
      bucket = { key: k, label: `${y} 年 ${Number(m)} 月`, items: [] };
      monthGroups.push(bucket);
    }
    bucket.items.push(c);
  }
  if (unattached) monthGroups.push(unattached);

  return (
    <>
      <Card className="mb-5 p-4">
        <SubmissionsListFilters searchPlaceholder="活动名 / 抖音昵称 / 抖音号 / 易闪 ID..." />
        <p className="mt-3 text-xs text-muted-foreground">
          共 {cards.length} 个活动 · {totalSubmissions} 条稿件
          {status ? `(仅含含「${STATUS_HEADING[status]}」的活动)` : ""}
        </p>
      </Card>

      {cards.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          没有符合条件的稿件。
        </Card>
      ) : (
        <div className="space-y-8">
          {monthGroups.map((g) => (
            <section key={g.key}>
              <div className="mb-3 flex items-baseline justify-between border-b border-border pb-2">
                <h2 className="text-sm font-medium">{g.label}</h2>
                <span className="text-xs text-muted-foreground">
                  共 {g.items.length} 个活动
                </span>
              </div>
              <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {g.items.map((c) => (
                  <ActivitySubmissionsCard
                    key={c.id ?? NO_ACTIVITY_KEY}
                    data={c}
                    highlight={status}
                    href={buildDrillHref(c.id, searchParams)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function buildDrillHref(
  activityId: string | null,
  searchParams: Record<string, string | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const k of ["status", "q", "from", "to"] as const) {
    const v = searchParams[k];
    if (v) sp.set(k, v);
  }
  if (activityId) sp.set("activityId", activityId);
  else sp.set("activityId", "__none__"); // 未挂活动的钻取桶
  const qs = sp.toString();
  return qs ? `/operator/submissions?${qs}` : "/operator/submissions";
}

// ── 视图二:某活动的稿件表格(沿用 SubmissionsTable + 批量审核) ──
async function TableView({
  activityId,
  status,
  q,
  platform,
  fromDate,
  toDate,
  page,
  pageSize,
  searchParams,
}: {
  activityId: string;
  status: SubmissionStatus | undefined;
  q: string;
  platform: string;
  fromDate: Date | null;
  toDate: Date | null;
  page: number;
  pageSize: number;
  searchParams: Record<string, string | undefined>;
}) {
  const filterByNoActivity = activityId === "__none__";
  const where: Prisma.SubmissionWhereInput = filterByNoActivity
    ? { activityId: null }
    : { activityId };
  if (status) where.status = status;
  if (platform) where.platform = platform;
  if (fromDate || toDate) {
    where.createdAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      {
        creator: {
          OR: [
            { nickname: { contains: q, mode: "insensitive" } },
            { dyName: { contains: q, mode: "insensitive" } },
            { dyAccount: { contains: q, mode: "insensitive" } },
            { ysId: { contains: q, mode: "insensitive" } },
            { groupNo: { contains: q, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  const [total, items, activity] = await Promise.all([
    prisma.submission.count({ where }),
    prisma.submission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        url: true,
        platform: true,
        externalId: true,
        status: true,
        titleStatus: true,
        titleNote: true,
        contentStatus: true,
        contentNote: true,
        yishanStatus: true,
        yishanNote: true,
        createdAt: true,
        creator: {
          select: {
            id: true,
            nickname: true,
            dyName: true,
            dyAccount: true,
            ysId: true,
            groupNo: true,
          },
        },
        activity: { select: { id: true, name: true } },
      },
    }),
    filterByNoActivity
      ? Promise.resolve(null)
      : prisma.activity.findUnique({
          where: { id: activityId },
          select: { id: true, name: true },
        }),
  ]);

  const rows: SubmissionRow[] = items.map((i) => ({
    id: i.id,
    title: i.title,
    url: i.url,
    platform: i.platform,
    externalId: i.externalId,
    status: i.status,
    titleStatus: i.titleStatus,
    titleNote: i.titleNote,
    contentStatus: i.contentStatus,
    contentNote: i.contentNote,
    yishanStatus: i.yishanStatus,
    yishanNote: i.yishanNote,
    createdAt: i.createdAt.toISOString(),
    creator: {
      id: i.creator.id,
      nickname: i.creator.nickname,
      dyName: i.creator.dyName,
      dyAccount: i.creator.dyAccount,
      ysId: i.creator.ysId,
      groupNo: i.creator.groupNo,
    },
    activity: i.activity,
  }));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const backHref = (() => {
    const sp = new URLSearchParams();
    for (const k of ["status", "q", "from", "to"] as const) {
      const v = searchParams[k];
      if (v) sp.set(k, v);
    }
    const qs = sp.toString();
    return qs ? `/operator/submissions?${qs}` : "/operator/submissions";
  })();

  return (
    <>
      <div className="mb-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          返回活动汇总
        </Link>
      </div>

      <Card className="mb-5 p-4">
        <div className="mb-3 text-sm">
          当前活动:
          <span className="ml-1 font-medium">
            {filterByNoActivity ? "未关联活动" : activity?.name ?? "(活动已删除)"}
          </span>
        </div>
        <SubmissionsListFilters showPlatform />
        <p className="mt-3 text-xs text-muted-foreground">
          共 {total} 条 · 当前页 {page} / {totalPages}
        </p>
      </Card>

      <SubmissionsTable rows={rows} />

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          buildHref={(p) => {
            const sp = new URLSearchParams();
            sp.set("activityId", activityId);
            for (const k of ["status", "q", "from", "to", "platform"] as const) {
              const v = searchParams[k];
              if (v) sp.set(k, v);
            }
            if (p !== 1) sp.set("page", String(p));
            if (pageSize !== 50) sp.set("pageSize", String(pageSize));
            return `/operator/submissions?${sp.toString()}`;
          }}
        />
      )}
    </>
  );
}

function Pagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (p: number) => string;
}) {
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      {page > 1 ? (
        <Button asChild size="sm" variant="outline">
          <Link href={buildHref(page - 1)}>
            <ChevronLeft className="size-3.5" />
            上一页
          </Link>
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled>
          <ChevronLeft className="size-3.5" />
          上一页
        </Button>
      )}
      <span className="text-xs text-muted-foreground">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Button asChild size="sm" variant="outline">
          <Link href={buildHref(page + 1)}>
            下一页
            <ChevronRight className="size-3.5" />
          </Link>
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled>
          下一页
          <ChevronRight className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
