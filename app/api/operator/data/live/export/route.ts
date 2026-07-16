/**
 * GET /api/operator/data/live/export — 导出「直播数据」当前筛选结果为 CSV。
 *
 * 鉴权:OPERATOR 起。口径:复用 buildLiveQuery(搜索/团号/日期/排序 + 本月默认),与页面一致。
 * 不分页:导出全部匹配记录。编码:UTF-8 + BOM(Excel 友好)。
 */
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDate, fmtDateTime } from "@/lib/format";

import { buildLiveQuery, type LiveSearchParams } from "@/app/operator/data/live/_lib/query";

export const runtime = "nodejs";

const HEADERS = [
  "平台",
  "UID",
  "主播昵称",
  "抖音号",
  "日期",
  "音浪(火力)",
  "有效开播时长(小时)",
  "ACU",
  "曝光人数",
  "曝光次数",
  "进直播间人数",
  "进直播间次数",
  "进直播间转化率",
  "人均观看时长(分钟)",
  "打赏人数",
  "打赏次数",
  "新增粉丝",
  "团号",
  "运营经纪人",
  "招募经纪人",
] as const;

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GET = route(async (req) => {
  await requireRole("OPERATOR");

  const sp = Object.fromEntries(new URL(req.url).searchParams) as LiveSearchParams;
  const { where, orderBy, defaultMonth, dateFrom, dateTo } = buildLiveQuery(sp);

  const rows = await prisma.liveStat.findMany({ where, orderBy });

  const lines: string[] = [HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.platform,
        r.uid,
        r.nickname ?? "",
        r.account ?? "",
        fmtDate(r.date),
        r.soundWave,
        r.liveDuration,
        r.acu,
        r.exposureUsers,
        r.exposureCount,
        r.enterRoomUsers,
        r.enterRoomCount,
        r.enterRoomRate,
        r.avgWatchDuration,
        r.tipUsers,
        r.tipCount,
        r.newFans,
        r.note ?? "",
        r.operatorAgent ?? "",
        r.recruitAgent ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const body = "﻿" + lines.join("\r\n");
  const scope = defaultMonth ? defaultMonth : `${dateFrom || "起"}_${dateTo || "今"}`;
  const stamp = fmtDateTime(new Date()).replace(/[\s:/]/g, "").slice(0, 12);
  const filename = `直播数据_${scope}_${stamp}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
});
