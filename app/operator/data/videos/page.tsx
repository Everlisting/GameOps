/**
 * 运营/管理员 · 项目数据 · 视频数据
 * 数据源:VideoStat(明细层,按 platform+externalId upsert 只留最新)
 * URL 参数:
 *   ?q=&groupNo=&publishedFrom=&publishedTo=
 *   &page=&pageSize=&sortBy=&order=
 * 顶部统计(受当前 where 影响):作品条数 / 作品人数(去重 UID) / 总播放量 / 总推荐播放量
 *
 * 默认视图:仅显示「本月发布」的稿件(按 publishedAt);往月稿件通过发布日期筛选查询。
 *   一旦用户指定了 publishedFrom / publishedTo,即以其区间为准,不再套用本月默认。
 */
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

import ExportVideosButton from "./_components/ExportVideosButton";
import ImportVideosButton from "./_components/ImportVideosButton";
import VideosDataTable from "./_components/VideosDataTable";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  type VideoRow,
  type VideoStats,
} from "./_components/config";
import { buildVideoQuery } from "./_lib/query";

function clampInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function clampPageSize(raw: string | undefined) {
  const n = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
    ? n
    : DEFAULT_PAGE_SIZE;
}

export default async function OperatorVideoDataPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    groupNo?: string;
    publishedFrom?: string;
    publishedTo?: string;
    status?: string;
    page?: string;
    pageSize?: string;
    sortBy?: string;
    order?: string;
  };
}) {
  await requireRole("OPERATOR");

  // 筛选口径(搜索/团号/发布日期/状态/排序 + 本月默认)与导出共用同一 helper
  const {
    q,
    groupNo,
    publishedFrom,
    publishedTo,
    status,
    sortBy,
    order,
    tableWhere,
    statsWhere,
    defaultMonth,
  } = buildVideoQuery(searchParams);
  const page = clampInt(searchParams?.page, 1, 1, 1_000_000);
  const pageSize = clampPageSize(searchParams?.pageSize);

  const [total, statsTotal, rows, agg, distinctGroups] = await Promise.all([
    prisma.videoStat.count({ where: tableWhere }),
    prisma.videoStat.count({ where: statsWhere }),
    prisma.videoStat.findMany({
      where: tableWhere,
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
        hidden: true,
        hiddenAt: true,
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
      where: statsWhere,
      _sum: { views: true, recommendedViews: true },
    }),
    // 去重创作者(按 creatorUid;null 不计入人数;只算正常态)
    prisma.videoStat.groupBy({ where: statsWhere, by: ["creatorUid"] }),
  ]);

  const stats: VideoStats = {
    totalRows: statsTotal,
    distinctCreators: distinctGroups.filter((g) => g.creatorUid !== null).length,
    sumViews: agg._sum.views ?? 0,
    sumRecommended: agg._sum.recommendedViews ?? 0,
  };

  const items: VideoRow[] = rows.map((r) => ({
    ...r,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    hiddenAt: r.hiddenAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <div className="flex h-[calc(100svh-4rem)] min-w-0 flex-col px-8 pb-8 pt-4">
      <header className="mb-3 flex shrink-0 items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">视频数据</h1>
          {/* <p className="mt-1 text-sm text-muted-foreground">
            抖音视频明细(VideoStat 明细层),按平台稿件 ID 唯一,爬虫每次上报覆盖最新快照。
          </p> */}
        </div>
        <div className="flex items-center gap-2">
          <ExportVideosButton />
          <ImportVideosButton />
        </div>
      </header>

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
        status={status}
        defaultMonth={defaultMonth}
      />
    </div>
  );
}
