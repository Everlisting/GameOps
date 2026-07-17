/**
 * 视频数据筛选口径 —— 页面(page.tsx)与导出(export route)共用,保证两边完全一致。
 *
 * 负责:解析 q / groupNo / 发布日期 / status / 排序,产出:
 *   - tableWhere:表格 / 导出用(含删除隐藏筛选)
 *   - statsWhere:统计卡用(恒 hidden=false)
 *   - defaultMonth:未指定发布日期时的「本月默认」标识(非空 = 处于本月默认视图)
 *
 * 分页(page/pageSize)是页面独有,不在这里。
 */
import type { Prisma } from "@prisma/client";

import { ALLOWED_SORT_BY, clampStatus, type SortField, type StatusFilter } from "../_components/config";

export type VideoSearchParams = {
  q?: string;
  groupNo?: string;
  publishedFrom?: string;
  publishedTo?: string;
  status?: string;
  sortBy?: string;
  order?: string;
};

export type VideoQuery = {
  q: string;
  groupNo: string;
  publishedFrom: string;
  publishedTo: string;
  status: StatusFilter;
  sortBy: SortField;
  order: "asc" | "desc";
  tableWhere: Prisma.VideoStatWhereInput;
  statsWhere: Prisma.VideoStatWhereInput;
  defaultMonth: string | null;
};

function clampSortBy(raw: string | undefined): SortField {
  return (ALLOWED_SORT_BY as readonly string[]).includes(raw ?? "")
    ? (raw as SortField)
    : "views"; // 默认按播放量降序(order 默认 desc)
}

function clampOrder(raw: string | undefined): "asc" | "desc" {
  return raw === "asc" ? "asc" : "desc";
}

function parseISODate(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function buildVideoQuery(sp: VideoSearchParams | undefined): VideoQuery {
  const q = sp?.q?.trim() ?? "";
  const groupNo = sp?.groupNo?.trim() ?? "";
  const publishedFrom = sp?.publishedFrom?.trim() ?? "";
  const publishedTo = sp?.publishedTo?.trim() ?? "";
  const status = clampStatus(sp?.status);
  const sortBy = clampSortBy(sp?.sortBy);
  const order = clampOrder(sp?.order);

  // baseWhere:搜索/团号/发布日期(不含删除隐藏状态)
  const where: Prisma.VideoStatWhereInput = {};
  if (q) {
    // 搜索命中:视频ID / 视频标题 / UID / 抖音昵称 / 抖音号
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { externalId: { contains: q, mode: "insensitive" } },
      { creatorUid: { contains: q, mode: "insensitive" } },
      { creatorName: { contains: q, mode: "insensitive" } },
      { creatorAccount: { contains: q, mode: "insensitive" } },
    ];
  }
  if (groupNo) {
    where.note = { contains: groupNo, mode: "insensitive" };
  }

  // 发布时间范围(具体到日;上界用 lt 次日);未指定则默认「本月发布」
  const fromDate = parseISODate(publishedFrom);
  const toDate = parseISODate(publishedTo);
  let defaultMonth: string | null = null;
  if (fromDate || toDate) {
    const range: Prisma.DateTimeNullableFilter = {};
    if (fromDate) range.gte = fromDate;
    if (toDate) {
      const t = new Date(toDate);
      t.setDate(t.getDate() + 1);
      range.lt = t;
    }
    where.publishedAt = range;
  } else {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    where.publishedAt = { gte: monthStart, lt: nextMonthStart };
    defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  const tableWhere: Prisma.VideoStatWhereInput = { ...where };
  if (status === "active") tableWhere.hidden = false;
  else if (status === "hidden") tableWhere.hidden = true;
  const statsWhere: Prisma.VideoStatWhereInput = { ...where, hidden: false };

  return {
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
  };
}
