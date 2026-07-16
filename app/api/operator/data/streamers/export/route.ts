/**
 * GET /api/operator/data/streamers/export — 导出「主播数据」当前筛选结果为 CSV。
 *
 * 鉴权:OPERATOR 起(与主播数据页一致)。
 * 口径:复用 buildAnchorQuery(名单 where + 视频聚合 join + 排序),与页面表格完全一致。
 * 不分页:导出全部匹配主播(按当前排序)。
 * 编码:UTF-8 + BOM,Excel 直接双击可正确显示中文。
 */
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDate, fmtDateTime } from "@/lib/format";

import {
  buildAnchorQuery,
  type AnchorSearchParams,
} from "@/app/operator/data/streamers/_lib/query";

export const runtime = "nodejs";

const HEADERS = [
  "平台",
  "UID",
  "主播昵称",
  "抖音号",
  "入会时间",
  "团号",
  "运营经纪人",
  "招募经纪人",
  "粉丝量",
  "作品数",
  "作品播放量",
  "作品推荐播放量",
  "涨粉",
  "直播天数",
  "直播时长",
  "ACU",
  "曝光人数",
  "曝光次数",
  "进直播间人数",
  "进直播间次数",
  "人均观看时长",
  "更新时间",
] as const;

type RawAnchor = {
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

/** RFC4180 转义:含逗号 / 引号 / 换行时用双引号包裹,内部引号翻倍。 */
function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GET = route(async (req) => {
  await requireRole("OPERATOR");

  const sp = Object.fromEntries(new URL(req.url).searchParams) as AnchorSearchParams;
  const { rosterWhere, aggJoin, liveAggJoin, orderSql, defaultMonth, publishedFrom, publishedTo } =
    buildAnchorQuery(sp);

  const rows = await prisma.$queryRaw<RawAnchor[]>`
    SELECT
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
  `;

  const lines: string[] = [HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.platform,
        r.uid,
        r.nickname ?? "",
        r.account ?? "",
        r.joinedAt ? fmtDate(r.joinedAt) : "",
        r.groupNo ?? "",
        r.operatorAgent ?? "",
        r.recruitAgent ?? "",
        r.fans,
        Number(r.worksCount),
        Number(r.worksViews),
        Number(r.worksRecommendedViews),
        Number(r.fansGained),
        r.anchorDays,
        Math.round(r.liveDuration * 100) / 100,
        Math.round(r.acu * 100) / 100,
        Number(r.exposureUsers),
        Number(r.exposureCount),
        Number(r.enterRoomUsers),
        Number(r.enterRoomCount),
        Math.round(r.avgWatchDuration * 100) / 100,
        fmtDateTime(r.updatedAt),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  // BOM + CRLF(Excel 友好)
  const body = "﻿" + lines.join("\r\n");

  // 文件名范围:本月默认 / 自定义发布区间
  const scope = defaultMonth
    ? defaultMonth
    : `${publishedFrom || "起"}_${publishedTo || "今"}`;
  const stamp = fmtDateTime(new Date()).replace(/[\s:/]/g, "").slice(0, 12);
  const filename = `主播数据_${scope}_${stamp}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
});
