import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { chinaDateTimeRange } from "@/lib/data-period";
import { submissionPeriodRangeSchema } from "@/lib/validation/submission-period";
import { assignedVideoScope, type ReviewActor } from "@/lib/video-review-access";

export type SubmissionPeriodSummary = {
  videoCount: number;
  authorCount: number;
  approvedCount: number;
  rejectedCount: number;
  approvedViews: number;
  rejectedViews: number;
  pendingCount: number;
  reviewedCount: number;
  progress: number;
};

/** 以视频发布时间统计当前库中的有效视频；审核结果与推荐播放量均取最新值。 */
export async function submissionPeriodSummary(from: string, to: string, actor: ReviewActor): Promise<SubmissionPeriodSummary> {
  const input = submissionPeriodRangeSchema.parse({ startDate: from, endDate: to });
  const range = chinaDateTimeRange(input.startDate, input.endDate);
  const [row] = await prisma.$queryRaw<{
    videoCount: number;
    authorCount: number;
    approvedCount: number;
    rejectedCount: number;
    approvedViews: bigint;
    rejectedViews: bigint;
  }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS "videoCount",
      COUNT(DISTINCT ("platform", "creatorUid")) FILTER (
        WHERE "creatorUid" IS NOT NULL AND BTRIM("creatorUid") <> ''
      )::int AS "authorCount",
      COUNT(*) FILTER (WHERE "reviewStatus" = 'APPROVED')::int AS "approvedCount",
      COUNT(*) FILTER (WHERE "reviewStatus" = 'REJECTED')::int AS "rejectedCount",
      COALESCE(SUM("recommendedViews") FILTER (WHERE "reviewStatus" = 'APPROVED'), 0)::bigint AS "approvedViews",
      COALESCE(SUM("recommendedViews") FILTER (WHERE "reviewStatus" = 'REJECTED'), 0)::bigint AS "rejectedViews"
    FROM "VideoStat"
    WHERE "hidden" = false AND "publishedAt" >= ${range.gte!} AND "publishedAt" < ${range.lt!}
      AND ${assignedVideoScope(actor, "VideoStat")}
  `);
  const reviewedCount = row.approvedCount + row.rejectedCount;
  return {
    ...row,
    approvedViews: Number(row.approvedViews),
    rejectedViews: Number(row.rejectedViews),
    reviewedCount,
    pendingCount: row.videoCount - reviewedCount,
    progress: !row.videoCount ? 0 : reviewedCount === row.videoCount ? 100
      : Math.min(99.99, Math.round(reviewedCount / row.videoCount * 10000) / 100),
  };
}
