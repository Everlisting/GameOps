import { randomInt } from "node:crypto";
import type { ReviewAssignmentGroup } from "@/lib/validation/review-assignment";

export type AllocationVideo = { id: string; platform: string; creatorUid: string | null };
export type AllocationTarget = { reviewerId: string; count: number };

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function equalAllocationCounts(total: number, reviewerIds: string[], random = () => randomInt(0x100000000) / 0x100000000): AllocationTarget[] {
  if (!reviewerIds.length) return [];
  const ids = shuffled(reviewerIds, random);
  return ids.map((reviewerId, index) => ({ reviewerId, count: Math.floor(total / ids.length) + (index < total % ids.length ? 1 : 0) }));
}

/** 先确定每组配额并合并同一审核员，再从全体候选一次性随机选稿，跨组不重复。 */
export function combinedAllocationCounts(groups: ReviewAssignmentGroup[], available: number, random = () => randomInt(0x100000000) / 0x100000000): AllocationTarget[] {
  const combined = new Map<string, number>();
  for (const group of groups) {
    const targets = group.mode === "EVEN"
      ? equalAllocationCounts(group.totalCount ?? available, group.recipients.map((row) => row.reviewerId), random)
      : group.recipients.map((row) => ({ reviewerId: row.reviewerId, count: row.count ?? 0 }));
    for (const target of targets) combined.set(target.reviewerId, (combined.get(target.reviewerId) ?? 0) + target.count);
  }
  return [...combined].map(([reviewerId, count]) => ({ reviewerId, count }));
}

/** 随机选稿、按作者打散；数量约束优先，同作者尽量分散到仍有配额的不同审核员。 */
export function allocateReviewVideos(
  videos: AllocationVideo[], targets: AllocationTarget[],
  random = () => randomInt(0x100000000) / 0x100000000,
): { videoId: string; reviewerId: string }[] {
  const total = targets.reduce((sum, target) => sum + target.count, 0);
  if (total > videos.length || targets.some((target) => !Number.isSafeInteger(target.count) || target.count < 0)
    || new Set(targets.map((target) => target.reviewerId)).size !== targets.length) {
    throw new Error("分配数量或审核员配置无效");
  }
  const groups = new Map<string, AllocationVideo[]>();
  for (const video of shuffled(videos, random).slice(0, total)) {
    const key = video.creatorUid?.trim() ? JSON.stringify([video.platform, video.creatorUid]) : video.id;
    const group = groups.get(key) ?? [];
    group.push(video); groups.set(key, group);
  }
  const remaining = shuffled(targets, random).map((target) => ({ ...target, remaining: target.count }));
  const result: { videoId: string; reviewerId: string }[] = [];
  for (const group of shuffled([...groups.values()], random).sort((a, b) => b.length - a.length)) {
    const authorCounts = new Map<string, number>();
    for (const video of group) {
      const available = remaining.filter((target) => target.remaining > 0);
      const minAuthor = Math.min(...available.map((target) => authorCounts.get(target.reviewerId) ?? 0));
      const spread = available.filter((target) => (authorCounts.get(target.reviewerId) ?? 0) === minAuthor);
      const maxRemaining = Math.max(...spread.map((target) => target.remaining));
      const candidates = spread.filter((target) => target.remaining === maxRemaining);
      const chosen = candidates[Math.floor(random() * candidates.length)];
      chosen.remaining--;
      authorCounts.set(chosen.reviewerId, (authorCounts.get(chosen.reviewerId) ?? 0) + 1);
      result.push({ videoId: video.id, reviewerId: chosen.reviewerId });
    }
  }
  return result;
}
