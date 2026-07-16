/**
 * GET /api/operator/data/videos/export — 导出「视频数据」当前筛选结果为 CSV。
 *
 * 鉴权:OPERATOR 起(与视频数据页一致)。
 * 筛选口径:复用 buildVideoQuery(q / 团号 / 发布日期 / 状态 / 排序 + 本月默认),
 *          与页面表格完全一致 —— 未指定发布日期时同样只导出「本月发布」。
 * 不分页:导出全部匹配行(按当前排序)。
 * 编码:UTF-8 + BOM,Excel 直接双击可正确显示中文。
 */
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";

import { buildVideoQuery, type VideoSearchParams } from "@/app/operator/data/videos/_lib/query";

export const runtime = "nodejs";

const HEADERS = [
  "平台",
  "稿件ID",
  "视频链接",
  "稿件标题",
  "发布时间",
  "状态",
  "主播昵称",
  "UID",
  "抖音号",
  "播放量",
  "推荐播放量",
  "点赞",
  "评论",
  "分享",
  "涨粉",
  "团号",
  "运营经纪人",
  "招募经纪人",
  "更新时间",
] as const;

/** RFC4180 转义:含逗号 / 引号 / 换行时用双引号包裹,内部引号翻倍。 */
function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GET = route(async (req) => {
  await requireRole("OPERATOR");

  const sp = Object.fromEntries(new URL(req.url).searchParams) as VideoSearchParams;
  const { tableWhere, sortBy, order, defaultMonth, publishedFrom, publishedTo } =
    buildVideoQuery(sp);

  const rows = await prisma.videoStat.findMany({
    where: tableWhere,
    orderBy: { [sortBy]: order },
    select: {
      platform: true,
      externalId: true,
      url: true,
      title: true,
      publishedAt: true,
      hidden: true,
      creatorUid: true,
      creatorName: true,
      creatorAccount: true,
      views: true,
      recommendedViews: true,
      likes: true,
      comments: true,
      shares: true,
      fansGained: true,
      note: true,
      operatorAgent: true,
      recruitAgent: true,
      updatedAt: true,
      creator: { select: { nickname: true } },
    },
  });

  const lines: string[] = [HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.platform,
        r.externalId,
        r.url,
        r.title,
        r.publishedAt ? fmtDateTime(r.publishedAt) : "",
        r.hidden ? "删除/隐藏" : "正常",
        r.creator?.nickname ?? r.creatorName ?? "",
        r.creatorUid ?? "",
        r.creatorAccount ?? "",
        r.views,
        r.recommendedViews,
        r.likes,
        r.comments,
        r.shares,
        r.fansGained,
        r.note ?? "",
        r.operatorAgent ?? "",
        r.recruitAgent ?? "",
        fmtDateTime(r.updatedAt),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  // BOM + CRLF(Excel 友好)
  const body = "﻿" + lines.join("\r\n");

  // 文件名:视频数据_<范围>_<导出时刻>.csv;范围 = 本月默认 / 自定义日期
  const scope = defaultMonth
    ? defaultMonth
    : `${publishedFrom || "起"}_${publishedTo || "今"}`;
  const stamp = fmtDateTime(new Date()).replace(/[\s:/]/g, "").slice(0, 12);
  const filename = `视频数据_${scope}_${stamp}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
});
