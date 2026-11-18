export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${Number((value / 100000000).toFixed(2))}亿`;
  if (abs >= 10000) return `${Number((value / 10000).toFixed(1))}万`;
  return value.toLocaleString("zh-CN");
}

export function percent(part: number, total: number): number {
  if (!total || !part) return 0;
  return part === total
    ? 100
    : Math.min(99.9, Math.round((part / total) * 1000) / 10);
}

export function percentageText(part: number, total: number): string {
  const value = percent(part, total);
  return part > 0 && total > 0 && value === 0 ? "<0.1%" : `${value}%`;
}

export function reviewHref(
  range: { from: string; to: string },
  status?: string,
) {
  const params = new URLSearchParams({
    from: range.from,
    to: range.to,
    keepFilters: "1",
  });
  if (status) params.set("status", status);
  return `/operator/submissions/review?${params.toString()}`;
}
