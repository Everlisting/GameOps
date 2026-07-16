/**
 * 直播数据筛选口径 —— 页面(page.tsx)与导出(export route)共用,保证两边一致。
 *
 * 产出:
 *   - where:LiveStat 查询条件(搜索 / 团号 / 日期范围)
 *   - orderBy:白名单排序
 *   - defaultMonth:未指定日期时的「本月默认」标识(非空 = 本月默认视图)
 *
 * 注意:LiveStat.date 是 @db.Date,按 UTC 零点存,故日期边界用 UTC 构造,避免本地时区偏移。
 */
import type { Prisma } from "@prisma/client";

import { ALLOWED_SORT_BY, DEFAULT_SORT_BY, type SortField } from "../_components/config";

export type LiveSearchParams = {
  q?: string;
  groupNo?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  order?: string;
};

export type LiveQuery = {
  q: string;
  groupNo: string;
  dateFrom: string;
  dateTo: string;
  sortBy: SortField;
  order: "asc" | "desc";
  where: Prisma.LiveStatWhereInput;
  orderBy: Prisma.LiveStatOrderByWithRelationInput;
  defaultMonth: string | null;
};

function clampSortBy(raw: string | undefined): SortField {
  return (ALLOWED_SORT_BY as readonly string[]).includes(raw ?? "")
    ? (raw as SortField)
    : DEFAULT_SORT_BY;
}

function clampOrder(raw: string | undefined): "asc" | "desc" {
  return raw === "asc" ? "asc" : "desc";
}

/** "YYYY-MM-DD" → 该日 UTC 零点;非法返回 undefined */
function parseUtcDate(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

export function buildLiveQuery(sp: LiveSearchParams | undefined): LiveQuery {
  const q = sp?.q?.trim() ?? "";
  const groupNo = sp?.groupNo?.trim() ?? "";
  const dateFrom = sp?.dateFrom?.trim() ?? "";
  const dateTo = sp?.dateTo?.trim() ?? "";
  const sortBy = clampSortBy(sp?.sortBy);
  const order = clampOrder(sp?.order);

  const where: Prisma.LiveStatWhereInput = {};
  if (q) {
    where.OR = [
      { uid: { contains: q, mode: "insensitive" } },
      { nickname: { contains: q, mode: "insensitive" } },
      { account: { contains: q, mode: "insensitive" } },
    ];
  }
  if (groupNo) {
    where.note = { contains: groupNo, mode: "insensitive" };
  }

  // 日期范围(上界用 lt 次日 UTC);未指定则默认「本月」
  const from = parseUtcDate(dateFrom);
  const to = parseUtcDate(dateTo);
  let defaultMonth: string | null = null;
  if (from || to) {
    const range: Prisma.DateTimeFilter = {};
    if (from) range.gte = from;
    if (to) {
      const t = new Date(to);
      t.setUTCDate(t.getUTCDate() + 1);
      range.lt = t;
    }
    where.date = range;
  } else {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));
    where.date = { gte: monthStart, lt: nextMonthStart };
    defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  const orderBy: Prisma.LiveStatOrderByWithRelationInput = { [sortBy]: order };

  return { q, groupNo, dateFrom, dateTo, sortBy, order, where, orderBy, defaultMonth };
}
