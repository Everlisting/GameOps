import { createHash } from "node:crypto";
import type { Prisma, SpecialActivity } from "@prisma/client";
import { chinaDateTimeRange } from "@/lib/data-period";
import { prisma } from "@/lib/db";
import { chinaDateStart } from "@/lib/time";
import { authorKey, calculateRewards, type ActivityVideo } from "./engine";
import { specialActivitySchema, type SpecialActivityInput } from "./rules";
import { videoFilterMatcher, videoFilterWhere } from "./filters";

type Database = Pick<Prisma.TransactionClient, "videoStat">;
const VIDEO_BATCH_SIZE = 2_000;
export const ACTIVITY_TRANSACTION_TIMEOUT_MS = 60_000;
const metrics = { views: true, recommendedViews: true, likes: true, comments: true, shares: true, fansGained: true } as const;

export function activityValues(input: SpecialActivityInput) {
  return {
    ...input,
    startDate: new Date(`${input.startDate}T00:00:00Z`),
    endDate: new Date(`${input.endDate}T00:00:00Z`),
    cutoffAt: input.settlementMode === "CUTOFF" && input.cutoffAt ? new Date(`${input.cutoffAt}:00+08:00`) : null,
  };
}

export function activityInput(activity: SpecialActivity): SpecialActivityInput {
  return specialActivitySchema.parse({
    ...activity,
    startDate: activity.startDate.toISOString().slice(0, 10),
    endDate: activity.endDate.toISOString().slice(0, 10),
    cutoffAt: activity.cutoffAt ? new Date(activity.cutoffAt.getTime() + 8 * 3600_000).toISOString().slice(0, 16) : null,
  });
}

type VideoQuery = Pick<SpecialActivityInput, "startDate" | "endDate" | "filters" | "settlementMode" | "cutoffAt">;

export async function activityVideos(input: VideoQuery, now = new Date(), db?: Database): Promise<ActivityVideo[]> {
  // 所有批次使用同一读视图，避免采集更新导致翻页漏算或重复计奖。
  if (!db) {
    return prisma.$transaction((tx) => activityVideos(input, now, tx), {
      isolationLevel: "RepeatableRead", timeout: ACTIVITY_TRANSACTION_TIMEOUT_MS,
    });
  }
  const configuredCutoff = input.settlementMode === "CUTOFF" && input.cutoffAt ? new Date(`${input.cutoffAt}:00+08:00`) : null;
  const cutoff = configuredCutoff && configuredCutoff <= now ? configuredCutoff : null;
  const where: Prisma.VideoStatWhereInput = {
    hidden: false,
    publishedAt: chinaDateTimeRange(input.startDate, input.endDate),
    AND: videoFilterWhere(input.filters),
  };
  const matches = videoFilterMatcher(input.filters);
  const videos: ActivityVideo[] = [];
  let cursor: { id: string; publishedAt: Date } | undefined;

  while (true) {
    const pageWhere: Prisma.VideoStatWhereInput = cursor ? {
      AND: [where, { OR: [
        { publishedAt: { lt: cursor.publishedAt } },
        { publishedAt: cursor.publishedAt, id: { gt: cursor.id } },
      ] }],
    } : where;
    const rows = await db.videoStat.findMany({
      where: pageWhere,
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      take: VIDEO_BATCH_SIZE,
      select: {
        id: true, url: true, externalId: true, title: true, platform: true, creatorUid: true, creatorName: true, creatorAccount: true, publishedAt: true,
        updatedAt: true, lastDatasetId: true, ...metrics,
        dailyStats: {
          where: cutoff ? { snapshotDate: { lte: chinaDateStart(cutoff) }, updatedAt: { lte: cutoff } } : { id: { in: [] } },
          orderBy: [{ snapshotDate: "desc" }, { updatedAt: "desc" }], take: 1,
          select: { ...metrics, updatedAt: true, datasetId: true },
        },
      },
    });
    for (const row of rows) {
      if (!matches(row)) continue;
      const source = cutoff && row.updatedAt > cutoff ? row.dailyStats[0] : { ...row, datasetId: row.lastDatasetId };
      videos.push({
        id: row.id, externalId: row.externalId, title: row.title, url: row.url, platform: row.platform, creatorUid: row.creatorUid,
        creatorName: row.creatorName, creatorAccount: row.creatorAccount, publishedAt: row.publishedAt!.toISOString(),
        dataAt: source?.updatedAt.toISOString() ?? null, datasetId: source?.datasetId ?? null,
        views: source?.views ?? 0, recommendedViews: source?.recommendedViews ?? 0,
        likes: source?.likes ?? 0, comments: source?.comments ?? 0, shares: source?.shares ?? 0, fansGained: source?.fansGained ?? 0,
      });
    }
    if (rows.length < VIDEO_BATCH_SIZE) return videos;
    const last = rows[rows.length - 1];
    cursor = { id: last.id, publishedAt: last.publishedAt! };
  }
}

export async function estimateActivity(input: SpecialActivityInput, now = new Date(), db?: Database) {
  const videos = await activityVideos(input, now, db);
  const result = calculateRewards(videos, input.pools);
  const authors = new Map<string, { key: string; name: string; uid: string; platform: string; count: number }>();
  let missingData = 0;
  let missingUid = 0;
  let dataAt: string | null = null;
  for (const video of videos) {
    if (!video.dataAt) missingData++;
    else if (!dataAt || video.dataAt > dataAt) dataAt = video.dataAt;
    const key = authorKey(video);
    if (!key || !video.creatorUid) {
      missingUid++;
      continue;
    }
    const author = authors.get(key);
    if (author) author.count++;
    else authors.set(key, { key, name: video.creatorName ?? video.creatorUid, uid: video.creatorUid, platform: video.platform, count: 1 });
  }
  return {
    videos, result, authors: [...authors.values()], missingData, missingUid, dataAt,
    recommendedViews: videos.reduce((sum, video) => sum + video.recommendedViews, 0),
    fingerprint: createHash("sha256").update(JSON.stringify({ input, videos })).digest("hex"),
  };
}

export type ActivityEstimate = Awaited<ReturnType<typeof estimateActivity>>;
