import { dateValue, chinaDateTimeRange } from "@/lib/data-period";
import { chinaDateStart } from "@/lib/time";

const DAY_MS = 86400000;
const MIN_DATE = "2000-01-01";
export function biRange(
  opts: { trendFrom?: string; trendTo?: string } = {},
  now = new Date(),
  latestPublication?: string,
) {
  const yesterday = new Date(chinaDateStart(now).getTime() - DAY_MS)
    .toISOString()
    .slice(0, 10);
  const requestedEnd = dateValue(opts.trendTo);
  const latest = dateValue(latestPublication);
  const defaultEnd =
    latest >= MIN_DATE && latest <= yesterday ? latest : yesterday;
  const to =
    requestedEnd >= MIN_DATE && requestedEnd <= yesterday
      ? requestedEnd
      : defaultEnd;
  const end = new Date(`${to}T00:00:00Z`);
  let from = dateValue(opts.trendFrom);
  if (!from || from > to)
    from = new Date(end.getTime() - 29 * DAY_MS).toISOString().slice(0, 10);
  const limit = new Date(end.getTime() - 365 * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const earliest = limit < MIN_DATE ? MIN_DATE : limit;
  if (from < earliest) from = earliest;
  return { from, to, publishedAt: chinaDateTimeRange(from, to) };
}

export type SnapshotDay = {
  day: Date;
  recorded: number;
  matched: number;
  change: bigint | null;
};
export function buildBiTrend(
  range: { from: string; to: string },
  snapshots: SnapshotDay[],
  publications: { date: string; works: number }[],
) {
  const byDay = new Map(
    snapshots.map((row) => [row.day.toISOString().slice(0, 10), row]),
  );
  const works = new Map(publications.map((row) => [row.date, row.works]));
  const result = [];
  for (
    let time = new Date(`${range.from}T00:00:00Z`).getTime();
    time <= new Date(`${range.to}T00:00:00Z`).getTime();
    time += DAY_MS
  ) {
    const date = new Date(time).toISOString().slice(0, 10);
    const snapshot = byDay.get(date);
    result.push({
      date,
      works: works.get(date) ?? 0,
      viewsChange:
        snapshot && snapshot.matched > 0 && snapshot.change !== null
          ? Number(snapshot.change)
          : null,
      matched: snapshot?.matched ?? 0,
      recorded: snapshot?.recorded ?? 0,
    });
  }
  return result;
}
