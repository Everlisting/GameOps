import { badRequest } from "@/lib/errors";
import { metricLabels, stepLabels, videoMetrics, type NumberField, type RewardPool, type RuleCondition } from "./rules";

type VideoMetrics = Record<(typeof videoMetrics)[number], number>;
export type ActivityVideo = VideoMetrics & {
  id: string; externalId?: string; title: string; url: string; platform: string; creatorUid: string | null;
  creatorName: string | null; creatorAccount?: string | null;
  publishedAt: string; dataAt: string | null; datasetId: string | null;
};

export function authorKey(video: ActivityVideo): string | null {
  return video.creatorUid ? JSON.stringify([video.platform, video.creatorUid]) : null;
}

type Row = {
  key: string;
  author: string;
  videos: ActivityVideo[];
  metrics: VideoMetrics & { count: number; maxRecommendedViews: number };
  cents: number;
  notes: Set<string>;
};

function metric(row: Row, field: NumberField) {
  return field === "reward" ? row.cents / 100 : row.metrics[field];
}

function sortByMetric(rows: Row[], field: NumberField) {
  return rows.sort((a, b) => metric(b, field) - metric(a, field) || a.key.localeCompare(b.key));
}

function matches(row: Row, condition: RuleCondition) {
  const { field, op, value } = condition;
  if (typeof value === "string") {
    const video = row.videos[0];
    const actual = field === "creatorUid" ? video.creatorUid ?? "" : field === "title" ? video.title : video.platform;
    const source = actual.toLocaleLowerCase();
    const target = value.toLocaleLowerCase();
    if (op === "contains") return source.includes(target);
    if (op === "notContains") return !source.includes(target);
    return source === target;
  }
  if (field === "title" || field === "creatorUid" || field === "platform") return false;
  const actual = metric(row, field);
  if (op === "gte") return actual >= value;
  if (op === "gt") return actual > value;
  if (op === "lte") return actual <= value;
  if (op === "lt") return actual < value;
  return actual === value;
}

function groupRows(rows: Row[]) {
  const authors = new Map<string, Row>();
  for (const row of rows) {
    const prior = authors.get(row.author);
    if (!prior) {
      authors.set(row.author, { ...row, key: row.author, metrics: { ...row.metrics }, videos: [...row.videos], notes: new Set(row.notes) });
      continue;
    }
    for (const field of videoMetrics) prior.metrics[field] += row.metrics[field];
    prior.metrics.count += row.metrics.count;
    prior.metrics.maxRecommendedViews = Math.max(prior.metrics.maxRecommendedViews, row.metrics.maxRecommendedViews);
    for (const video of row.videos) prior.videos.push(video);
    for (const note of row.notes) prior.notes.add(note);
    prior.cents += row.cents;
  }
  return [...authors.values()];
}

function addAward(row: Row, cents: number, note: string) {
  if (!Number.isSafeInteger(cents + row.cents)) throw badRequest("计算结果超出可结算范围，请检查金额和比例配置");
  row.cents += cents;
  row.notes.add(note);
}

export function calculateRewards(videos: ActivityVideo[], pools: RewardPool[]) {
  const claimedGroups = new Map<string, Set<string>>();
  const authorTotals = new Map<string, number>();
  const outcomes = pools.map((pool) => {
    const excluded: Record<string, string> = {};
    let rows: Row[] = videos.flatMap((video) => {
      const author = authorKey(video);
      if (!author || !video.dataAt) {
        excluded[video.id] = author ? "缺少可用指标" : "缺少达人 UID";
        return [];
      }
      return [{ key: video.id, author, videos: [video], metrics: { ...video, count: 1, maxRecommendedViews: video.recommendedViews }, cents: 0, notes: new Set<string>() }];
    });
    const stepCounts: number[] = [];
    const disqualify = (row: Row, reason: string) => {
      for (const video of row.videos) excluded[video.id] = reason;
    };

    pool.steps.forEach((step, i) => {
      const label = `步骤 ${i + 1} · ${stepLabels[step.kind]}`;
      if (step.kind === "FILTER") {
        rows = rows.filter((row) => {
          const eligible = step.match === "ALL"
            ? step.conditions.every((c) => matches(row, c))
            : step.conditions.some((c) => matches(row, c));
          if (!eligible) disqualify(row, `未通过${label}`);
          return eligible;
        });
      } else if (step.kind === "GROUP") {
        rows = groupRows(rows);
      } else if (step.kind === "LIMIT") {
        const seen = new Map<string, number>();
        rows = sortByMetric(rows, step.metric).filter((row) => {
          const key = step.scope === "AUTHOR" ? row.author : "";
          const count = (seen.get(key) ?? 0) + 1;
          seen.set(key, count);
          if (count > step.count) disqualify(row, `超出${label}的名额`);
          return count <= step.count;
        });
      } else if (step.kind === "TIER") {
        const tiers = [...step.tiers].sort((a, b) => b.min - a.min);
        for (const row of rows) {
          const hit = tiers.find((tier) => metric(row, step.metric) >= tier.min);
          if (hit) addAward(row, Math.round(hit.amount * 100), `${label} · ${metricLabels[step.metric]}达到 ${hit.min}，计 ¥${hit.amount}`);
          else row.notes.add(`${label} · 未达最低档`);
        }
      } else if (step.kind === "RANK") {
        rows = sortByMetric(rows, step.metric);
        const ranges = [...step.ranges].sort((a, b) => a.from - b.from);
        let rangeIndex = 0;
        rows.forEach((row, index) => {
          const rank = index + 1;
          while (ranges[rangeIndex] && rank > ranges[rangeIndex].to) rangeIndex++;
          const range = ranges[rangeIndex];
          const note = `${label} · ${metricLabels[step.metric]}第 ${rank} 名`;
          if (range && rank >= range.from) addAward(row, Math.round(range.amount * 100), `${note}，计 ¥${range.amount}`);
          else row.notes.add(`${note}，未命中奖励区间`);
        });
      } else if (step.kind === "RATE") {
        for (const row of rows) {
          // 当前奖励以分计算；其他指标均为整数。整数分子除法四舍五入到分。
          const scale = step.metric === "reward" ? 100 : 1;
          const value = BigInt(Math.max(0, Math.round(metric(row, step.metric) * scale)));
          const divisor = BigInt(step.unit * scale);
          const numerator = value * BigInt(Math.round(step.amount * 100));
          addAward(row, Number((numerator + divisor / BigInt(2)) / divisor), `${label} · 每 ${step.unit} 计 ¥${step.amount}`);
        }
      } else if (step.kind === "FIXED") {
        for (const row of rows) addAward(row, Math.round(step.amount * 100), `${label} · 计 ¥${step.amount}`);
      } else {
        for (const row of rows) {
          const cap = Math.round(step.amount * 100);
          if (row.cents > cap) row.notes.add(`${label} · ¥${row.cents / 100} 封顶为 ¥${step.amount}`);
          row.cents = Math.min(row.cents, cap);
        }
      }
      stepCounts.push(rows.length);
    });

    const group = claimedGroups.get(pool.exclusiveGroup) ?? new Set<string>();
    if (pool.exclusiveGroup) claimedGroups.set(pool.exclusiveGroup, group);
    const recipients = groupRows(rows).map((row) => {
      const suppressed = !!pool.exclusiveGroup && row.cents > 0 && group.has(row.author);
      const paidCents = suppressed ? 0 : row.cents;
      if (paidCents > 0 && pool.exclusiveGroup) group.add(row.author);
      const total = (authorTotals.get(row.author) ?? 0) + paidCents;
      if (!Number.isSafeInteger(total)) throw badRequest("作者总奖励超出可结算范围");
      authorTotals.set(row.author, total);
      const videoIds = row.videos.filter((video) => !excluded[video.id]).map((video) => video.id);
      return { author: row.author, videoIds, calculatedCents: row.cents, paidCents, suppressed, notes: [...row.notes] };
    });
    return { name: pool.name, exclusiveGroup: pool.exclusiveGroup, recipients, excluded, stepCounts };
  });
  const totalCents = [...authorTotals.values()].reduce((total, amount) => total + amount, 0);
  if (!Number.isSafeInteger(totalCents)) throw badRequest("活动总奖励超出可结算范围");
  return { pools: outcomes, authorTotals: Object.fromEntries(authorTotals), totalCents };
}

export type RewardResult = ReturnType<typeof calculateRewards>;
