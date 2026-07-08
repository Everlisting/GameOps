/**
 * 运营/管理员 · 项目数据 · 视频数据
 * 数据源:VideoStat(明细层,按 platform+externalId upsert 只留最新)
 * URL 参数:
 *   ?q=&groupNo=&publishedFrom=&publishedTo=
 *   &page=&pageSize=&sortBy=&order=
 * 顶部统计(受当前 where 影响):作品条数 / 作品人数(去重 UID) / 总播放量 / 总推荐播放量
 */
import type { Prisma } from "@prisma/client";
import { BarChart3 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

import VideosDataTable from "./_components/VideosDataTable";
import {
  ALLOWED_SORT_BY,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  type SortField,
  type VideoRow,
  type VideoStats,
} from "./_components/config";

function clampInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function clampSortBy(raw: string | undefined): SortField {
  return (ALLOWED_SORT_BY as readonly string[]).includes(raw ?? "")
    ? (raw as SortField)
    : "updatedAt";
}

function clampOrder(raw: string | undefined): "asc" | "desc" {
  return raw === "asc" ? "asc" : "desc";
}

function clampPageSize(raw: string | undefined) {
  const n = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
    ? n
    : DEFAULT_PAGE_SIZE;
}

function parseISODate(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function OperatorVideoDataPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    groupNo?: string;
    publishedFrom?: string;
    publishedTo?: string;
    page?: string;
    pageSize?: string;
    sortBy?: string;
    order?: string;
  };
}) {
  await requireRole("OPERATOR");

  const q = searchParams?.q?.trim() ?? "";
  const groupNo = searchParams?.groupNo?.trim() ?? "";
  const publishedFrom = searchParams?.publishedFrom?.trim() ?? "";
  const publishedTo = searchParams?.publishedTo?.trim() ?? "";
  const page = clampInt(searchParams?.page, 1, 1, 1_000_000);
  const pageSize = clampPageSize(searchParams?.pageSize);
  const sortBy = clampSortBy(searchParams?.sortBy);
  const order = clampOrder(searchParams?.order);

  const where: Prisma.VideoStatWhereInput = {};
  if (q) {
    // 搜索仅命中:视频ID / 视频标题 / UID / 抖音昵称 / 抖音号
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { externalId: { contains: q, mode: "insensitive" } },
      { creatorUid: { contains: q, mode: "insensitive" } },
      { creatorName: { contains: q, mode: "insensitive" } },
      { creatorAccount: { contains: q, mode: "insensitive" } },
    ];
  }
  // 团号 = note 字段(表头改名,数据同源)
  if (groupNo) {
    where.note = { contains: groupNo, mode: "insensitive" };
  }
  // 发布时间范围(具体到日;上界用 lt 次日,涵盖当日 23:59:59.999)
  const fromDate = parseISODate(publishedFrom);
  const toDate = parseISODate(publishedTo);
  if (fromDate || toDate) {
    const range: Prisma.DateTimeNullableFilter = {};
    if (fromDate) range.gte = fromDate;
    if (toDate) {
      const t = new Date(toDate);
      t.setDate(t.getDate() + 1);
      range.lt = t;
    }
    where.publishedAt = range;
  }

  const [total, rows, agg, distinctGroups] = await Promise.all([
    prisma.videoStat.count({ where }),
    prisma.videoStat.findMany({
      where,
      orderBy: { [sortBy]: order },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        platform: true,
        externalId: true,
        url: true,
        title: true,
        publishedAt: true,
        creatorUid: true,
        creatorName: true,
        creatorAccount: true,
        views: true,
        recommendedViews: true,
        likes: true,
        comments: true,
        shares: true,
        fansGained: true,
        operatorAgent: true,
        recruitAgent: true,
        note: true,
        updatedAt: true,
        creator: { select: { id: true, nickname: true } },
      },
    }),
    prisma.videoStat.aggregate({
      where,
      _sum: { views: true, recommendedViews: true },
    }),
    // 去重创作者(按 creatorUid;null 不计入人数)
    prisma.videoStat.groupBy({ where, by: ["creatorUid"] }),
  ]);

  const stats: VideoStats = {
    totalRows: total,
    distinctCreators: distinctGroups.filter((g) => g.creatorUid !== null).length,
    sumViews: agg._sum.views ?? 0,
    sumRecommended: agg._sum.recommendedViews ?? 0,
  };

  const items: VideoRow[] = rows.map((r) => ({
    ...r,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }));

  const hasFilter =
    !!(q || groupNo || publishedFrom || publishedTo);

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">视频数据</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          抖音视频明细(VideoStat 明细层),按平台稿件 ID 唯一,爬虫每次上报覆盖最新快照。
        </p>
      </header>

      {total === 0 && !hasFilter ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          <BarChart3 className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3">还没有视频数据。等爬虫机上报后会显示在这里。</p>
        </Card>
      ) : (
        <VideosDataTable
          items={items}
          total={total}
          stats={stats}
          page={page}
          pageSize={pageSize}
          sortBy={sortBy}
          order={order}
          q={q}
          groupNo={groupNo}
          publishedFrom={publishedFrom}
          publishedTo={publishedTo}
        />
      )}
    </div>
  );
}
