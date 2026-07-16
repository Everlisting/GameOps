/**
 * 运营/管理员 · 项目数据 · 直播数据
 * 数据源:LiveStat(直播明细,主播 × 自然日,导入 / 爬虫 upsert,只留开播时长>0 的记录)。
 *
 * URL 参数:?q=&groupNo=&dateFrom=&dateTo=&page=&pageSize=&sortBy=&order=
 * 顶部统计(受筛选影响):记录数 / 主播数 / 总开播时长 / 总曝光人数
 * 默认视图:仅显示本月日期的记录;往月通过日期筛选查询。
 */
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

import ExportLiveButton from "./_components/ExportLiveButton";
import ImportLiveButton from "./_components/ImportLiveButton";
import LiveDataTable from "./_components/LiveDataTable";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  type LiveRow,
  type LiveStats,
} from "./_components/config";
import { buildLiveQuery } from "./_lib/query";

function clampInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function clampPageSize(raw: string | undefined) {
  const n = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

export default async function OperatorLiveDataPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    groupNo?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
    pageSize?: string;
    sortBy?: string;
    order?: string;
  };
}) {
  await requireRole("OPERATOR");

  const { q, groupNo, dateFrom, dateTo, sortBy, order, where, orderBy, defaultMonth } =
    buildLiveQuery(searchParams);
  const page = clampInt(searchParams?.page, 1, 1, 1_000_000);
  const pageSize = clampPageSize(searchParams?.pageSize);

  const [total, rows, agg, distinctAnchors] = await Promise.all([
    prisma.liveStat.count({ where }),
    prisma.liveStat.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.liveStat.aggregate({
      where,
      _sum: { liveDuration: true, exposureUsers: true },
    }),
    prisma.liveStat.groupBy({ where, by: ["uid"] }),
  ]);

  const stats: LiveStats = {
    recordCount: total,
    anchorCount: distinctAnchors.length,
    totalDuration: Math.round((agg._sum.liveDuration ?? 0) * 100) / 100,
    totalExposure: agg._sum.exposureUsers ?? 0,
  };

  const items: LiveRow[] = rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    uid: r.uid,
    date: r.date.toISOString(),
    nickname: r.nickname,
    account: r.account,
    soundWave: r.soundWave,
    liveDuration: r.liveDuration,
    exposureUsers: r.exposureUsers,
    exposureCount: r.exposureCount,
    enterRoomUsers: r.enterRoomUsers,
    enterRoomCount: r.enterRoomCount,
    enterRoomRate: r.enterRoomRate,
    avgWatchDuration: r.avgWatchDuration,
    tipUsers: r.tipUsers,
    tipCount: r.tipCount,
    newFans: r.newFans,
    acu: r.acu,
    note: r.note,
    operatorAgent: r.operatorAgent,
    recruitAgent: r.recruitAgent,
  }));

  return (
    <div className="flex h-[calc(100svh-4rem)] min-w-0 flex-col px-8 pb-8 pt-4">
      <header className="mb-3 flex shrink-0 items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">直播数据</h1>
          {/* <p className="mt-1 text-sm text-muted-foreground">
            直播明细(LiveStat,主播 × 自然日),按平台+UID+日期唯一,导入/爬虫覆盖最新;
            仅收录开播时长&gt;0 的记录。
          </p> */}
        </div>
        <div className="flex items-center gap-2">
          <ExportLiveButton />
          <ImportLiveButton />
        </div>
      </header>

      <LiveDataTable
        items={items}
        total={total}
        stats={stats}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        order={order}
        q={q}
        groupNo={groupNo}
        dateFrom={dateFrom}
        dateTo={dateTo}
        defaultMonth={defaultMonth}
      />
    </div>
  );
}
