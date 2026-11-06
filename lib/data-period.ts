import { chinaDateString } from "@/lib/time";

/** YYYY-MM-DD 日历值;不依赖服务器时区,并拒绝 2 月 30 日等溢出日期。 */
export function dateValue(raw: string | undefined): string {
  const value = raw?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}

export function nextDateValue(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** 业务日期一律按北京时间:月初至今天(含今天)。 */
export function monthToDate(now: Date = new Date()) {
  const to = chinaDateString(now);
  return { from: `${to.slice(0, 8)}01`, to };
}

/** DateTime 字段的日范围:北京时间起日 00:00 至止日次日 00:00(排他)。 */
export function chinaDateTimeRange(from: string, to: string) {
  return {
    gte: from ? new Date(`${from}T00:00:00+08:00`) : undefined,
    lt: to ? new Date(`${nextDateValue(to)}T00:00:00+08:00`) : undefined,
  };
}

/** 新标签页按平台 + UID 精确查询达人本月投稿;不带入主播名单筛选。 */
export function creatorMonthVideosHref(platform: string, uid: string, from: string, to: string): string {
  const params = new URLSearchParams({ platform, creatorUid: uid, publishedFrom: from, publishedTo: to, keepFilters: "1" });
  return `/operator/data/videos?${params.toString()}`;
}
