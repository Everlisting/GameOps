import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { activityInput, estimateActivity, type ActivityEstimate } from "./db";

export type ActivityCardSummary = {
  videoCount: number;
  authorCount: number;
  recommendedViews: number;
  totalCents: number;
};

export async function activityCardSummary(id: string, revision: number, settledAt: string | null): Promise<ActivityCardSummary> {
  // 未结算统计短时复用；编辑规则或确认结算后使用新的缓存键。
  return unstable_cache(async () => {
    const activity = await prisma.specialActivity.findUnique({ where: { id } });
    if (!activity) throw notFound("专题活动不存在");
    const frozen = activity.settlement as { version: 1 | 2; estimate: ActivityEstimate } | null;
    const estimate = frozen?.estimate ?? await estimateActivity(activityInput(activity));
    return {
      videoCount: estimate.videos.length,
      authorCount: estimate.authors.length,
      recommendedViews: estimate.recommendedViews,
      totalCents: estimate.result.totalCents,
    };
  }, ["special-activity-card-summary-approved-v2", id, String(revision), settledAt ?? "unsettled"], {
    revalidate: settledAt ? false : 60,
    tags: settledAt ? [] : ["special-activity-estimates"],
  })();
}
