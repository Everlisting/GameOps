const FILTER_KEYS = [
  "reviewPeriod",
  "q",
  "groupNo",
  "creatorUid",
  "joinedFrom",
  "joinedTo",
  "status",
  "type",
  "category",
  "tag",
  "published",
  "role",
  "platform",
  "visibility",
  "action",
  "targetType",
  "from",
  "to",
  "dateFrom",
  "dateTo",
  "publishedFrom",
  "publishedTo",
  "trendFrom",
  "trendTo",
  "sortBy",
  "order",
  "page",
  "pageSize",
  "active",
  "enabled",
  "enrolled",
  "activityId",
  "agentId",
  "csvType",
];

/** 清除列表筛选，保留锚点、业务参数及显式要求保留筛选的链接。 */
export function resetEntryFilters(url: URL): boolean {
  if (url.searchParams.has("keepFilters")) return false;

  let changed = false;
  for (const key of FILTER_KEYS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  return changed;
}
