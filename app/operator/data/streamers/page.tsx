/**
 * 运营/管理员 · 项目数据 · 主播数据
 *
 * 数据来源:
 *   - 名单基表 AnchorStat(运营导入维护),一行 = 一个主播;身份 / 花名册字段来自导入。
 *   - 数值指标按 UID 聚合明细:作品数 / 作品播放量 / 作品推荐播放量 / 涨粉 ← 视频明细(hidden=false)。
 *   - 保证「本月没发作品的主播也在名单内」(聚合值为 0,不会因没作品而消失)。
 *
 * URL 参数:?q=&groupNo=&publishedFrom=&publishedTo=&page=&pageSize=&sortBy=&order=
 * 顶部统计(受名单筛选影响):名单主播数 / 总作品数 / 总作品播放量 / 总作品推荐播放量
 *
 * 直播维度指标(粉丝量 / 直播天数 / ACU / 直播时长 / 直播场次 / 曝光 / 进直播间 / 人均观看时长)
 * 待「直播明细表」落库后,在 _lib/query.ts 按同一 UID 再 LEFT JOIN 一段同构子查询接入。
 */
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

import ExportStreamersButton from "./_components/ExportStreamersButton";
import ImportStreamersButton from "./_components/ImportStreamersButton";
import StreamersDataTable from "./_components/StreamersDataTable";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  type AnchorRow,
  type AnchorStats,
} from "./_components/config";
import { buildAnchorQuery } from "./_lib/query";

function clampInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function clampPageSize(raw: string | undefined) {
  const n = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

type RawAnchor = {
  id: string;
  platform: string;
  uid: string;
  nickname: string | null;
  account: string | null;
  joinedAt: Date | null;
  groupNo: string | null;
  operatorAgent: string | null;
  recruitAgent: string | null;
  fans: number;
  worksCount: bigint;
  worksViews: bigint;
  worksRecommendedViews: bigint;
  fansGained: bigint;
  anchorDays: number;
  liveDuration: number;
  acu: number;
  exposureUsers: bigint;
  exposureCount: bigint;
  enterRoomUsers: bigint;
  enterRoomCount: bigint;
  avgWatchDuration: number;
  updatedAt: Date;
};

export default async function OperatorStreamerDataPage({
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

  const {
    q,
    groupNo,
    publishedFrom,
    publishedTo,
    sortBy,
    order,
    rosterWhere,
    aggJoin,
    liveAggJoin,
    orderSql,
    defaultMonth,
  } = buildAnchorQuery(searchParams);
  const page = clampInt(searchParams?.page, 1, 1, 1_000_000);
  const pageSize = clampPageSize(searchParams?.pageSize);
  const offset = (page - 1) * pageSize;

  const [rows, statsRows] = await Promise.all([
    prisma.$queryRaw<RawAnchor[]>`
      SELECT
        a."id"                                  AS id,
        a."platform"                            AS platform,
        a."uid"                                 AS uid,
        a."nickname"                            AS nickname,
        a."account"                             AS account,
        a."joinedAt"                            AS "joinedAt",
        a."groupNo"                             AS "groupNo",
        a."operatorAgent"                       AS "operatorAgent",
        a."recruitAgent"                        AS "recruitAgent",
        a."fans"                                AS fans,
        COALESCE(vs."works", 0)::bigint         AS "worksCount",
        COALESCE(vs."views", 0)::bigint         AS "worksViews",
        COALESCE(vs."rec", 0)::bigint           AS "worksRecommendedViews",
        COALESCE(vs."fansGained", 0)::bigint    AS "fansGained",
        COALESCE(ls."anchorDays", 0)::int              AS "anchorDays",
        COALESCE(ls."liveDuration", 0)::double precision AS "liveDuration",
        COALESCE(ls."acu", 0)::double precision          AS "acu",
        COALESCE(ls."exposureUsers", 0)::bigint          AS "exposureUsers",
        COALESCE(ls."exposureCount", 0)::bigint          AS "exposureCount",
        COALESCE(ls."enterRoomUsers", 0)::bigint         AS "enterRoomUsers",
        COALESCE(ls."enterRoomCount", 0)::bigint         AS "enterRoomCount",
        COALESCE(ls."avgWatchDuration", 0)::double precision AS "avgWatchDuration",
        a."updatedAt"                           AS "updatedAt"
      FROM "AnchorStat" a
      ${aggJoin}
      ${liveAggJoin}
      WHERE ${rosterWhere}
      ORDER BY ${orderSql}
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    // 顶部统计 + 分页总数(名单主播数 doubles as total)
    prisma.$queryRaw<{ anchors: bigint; works: bigint; views: bigint; rec: bigint }[]>`
      SELECT
        COUNT(*)::bigint                                   AS anchors,
        COALESCE(SUM(COALESCE(vs."works", 0)), 0)::bigint  AS works,
        COALESCE(SUM(COALESCE(vs."views", 0)), 0)::bigint  AS views,
        COALESCE(SUM(COALESCE(vs."rec", 0)), 0)::bigint    AS rec
      FROM "AnchorStat" a
      ${aggJoin}
      WHERE ${rosterWhere}
    `,
  ]);

  const anchorCount = Number(statsRows[0]?.anchors ?? 0n);
  const stats: AnchorStats = {
    anchorCount,
    totalWorks: Number(statsRows[0]?.works ?? 0n),
    totalViews: Number(statsRows[0]?.views ?? 0n),
    totalRecommended: Number(statsRows[0]?.rec ?? 0n),
  };

  const items: AnchorRow[] = rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    uid: r.uid,
    nickname: r.nickname,
    account: r.account,
    joinedAt: r.joinedAt?.toISOString() ?? null,
    groupNo: r.groupNo,
    operatorAgent: r.operatorAgent,
    recruitAgent: r.recruitAgent,
    fans: r.fans,
    worksCount: Number(r.worksCount),
    worksViews: Number(r.worksViews),
    worksRecommendedViews: Number(r.worksRecommendedViews),
    fansGained: Number(r.fansGained),
    anchorDays: r.anchorDays,
    liveDuration: r.liveDuration,
    acu: r.acu,
    exposureUsers: Number(r.exposureUsers),
    exposureCount: Number(r.exposureCount),
    enterRoomUsers: Number(r.enterRoomUsers),
    enterRoomCount: Number(r.enterRoomCount),
    avgWatchDuration: r.avgWatchDuration,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <div className="flex h-[calc(100svh-4rem)] min-w-0 flex-col px-8 pb-8 pt-4">
      <header className="mb-3 flex shrink-0 items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">主播数据</h1>
          {/* <p className="mt-1 text-sm text-muted-foreground">
            名单由导入维护(AnchorStat),数值按 UID 聚合明细:作品维度取自视频明细,
            直播维度(直播天数 / ACU / 直播时长 / 曝光 / 进直播间 / 人均观看时长)取自直播明细;
            率·均值类按开播天数平均。默认统计本月,往月用日期筛选。
          </p> */}
        </div>
        <div className="flex items-center gap-2">
          <ExportStreamersButton />
          <ImportStreamersButton />
        </div>
      </header>

      <StreamersDataTable
        items={items}
        total={anchorCount}
        stats={stats}
        page={page}
        pageSize={pageSize}
        sortBy={sortBy}
        order={order}
        q={q}
        groupNo={groupNo}
        publishedFrom={publishedFrom}
        publishedTo={publishedTo}
        defaultMonth={defaultMonth}
      />
    </div>
  );
}
