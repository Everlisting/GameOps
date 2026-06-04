/**
 * 单活动 · 聚合层 · 把 DB 状态压成引擎所需的 CreatorMetrics[]。
 *
 * 候选创作者 = 本活动有「报名记录」或「投稿记录」的并集
 *   (有人不报名直接投稿,也有人报名后没投;两条都要纳入结算视野)
 *
 * 指标聚合口径(v1):
 *   - submissions          本活动下该创作者的全部投稿条数(不分状态)
 *   - approvedSubmissions  status=APPROVED 的条数
 *   - views/likes/comments/shares
 *       只从 status=APPROVED 且 platform=douyin 且有 externalId 的投稿出发,
 *       去 VideoStat 按 (platform, externalId) 加总。
 *       未审核 / 已拒的稿件不参与互动数据计算(防刷),由 PER_SUBMISSION.approvedOnly 之外的规则口径统一。
 *
 * 非抖音平台暂时 views/likes 等都是 0(数据源还没接);PER_SUBMISSION 之类的"数稿件"
 * 规则照常生效。
 *
 * 一次拉满,不分页:活动报名通常 <= 几百人,Submission/VideoStat 链表也是同等量级。
 */
import { prisma } from "@/lib/db";
import type { CreatorMetrics } from "./engine";

/** 聚合返回项 = 引擎入参 + 展示用身份信息(UI 可直接用) */
export type CreatorAggregate = CreatorMetrics & {
  nickname: string;
  username: string;
  avatarUrl: string | null;
};

export async function aggregateActivityMetrics(
  activityId: string,
): Promise<CreatorAggregate[]> {
  // ── 1. 候选创作者:报名 ∪ 投稿 ──────────────────────────
  const [enrollments, submitters] = await Promise.all([
    prisma.activityEnrollment.findMany({
      where: { activityId },
      select: { creatorId: true },
    }),
    prisma.submission.findMany({
      where: { activityId },
      distinct: ["creatorId"],
      select: { creatorId: true },
    }),
  ]);
  const creatorIds = Array.from(
    new Set([
      ...enrollments.map((e) => e.creatorId),
      ...submitters.map((s) => s.creatorId),
    ]),
  );
  if (creatorIds.length === 0) return [];

  // ── 2. 拉创作者基本信息(UI 直接用) ─────────────────────
  const creators = await prisma.creator.findMany({
    where: { id: { in: creatorIds } },
    select: {
      id: true,
      nickname: true,
      avatarUrl: true,
      user: { select: { username: true } },
    },
  });
  const creatorInfoMap = new Map(
    creators.map((c) => [
      c.id,
      {
        nickname: c.nickname,
        avatarUrl: c.avatarUrl,
        username: c.user.username,
      },
    ]),
  );

  // ── 3. 投稿条数 + 已通过条数(分两次 count 比 groupBy 直观) ─
  const allSubs = await prisma.submission.findMany({
    where: { activityId, creatorId: { in: creatorIds } },
    select: {
      creatorId: true,
      status: true,
      platform: true,
      externalId: true,
    },
  });
  const subCount = new Map<string, { total: number; approved: number }>();
  for (const s of allSubs) {
    const e = subCount.get(s.creatorId) ?? { total: 0, approved: 0 };
    e.total += 1;
    if (s.status === "APPROVED") e.approved += 1;
    subCount.set(s.creatorId, e);
  }

  // ── 4. 抖音稿件互动数据:approved + douyin + externalId 才算 ─
  const approvedDouyinSubs = allSubs.filter(
    (s) => s.status === "APPROVED" && s.platform === "douyin" && s.externalId,
  );
  const externalIds = Array.from(
    new Set(approvedDouyinSubs.map((s) => s.externalId!)),
  );

  const stats =
    externalIds.length > 0
      ? await prisma.videoStat.findMany({
          where: { platform: "douyin", externalId: { in: externalIds } },
          select: {
            externalId: true,
            views: true,
            likes: true,
            comments: true,
            shares: true,
          },
        })
      : [];
  const statByExternalId = new Map(stats.map((s) => [s.externalId, s]));

  type MetricSum = {
    views: number;
    likes: number;
    comments: number;
    shares: number;
  };
  const metricsByCreator = new Map<string, MetricSum>();
  for (const sub of approvedDouyinSubs) {
    const stat = statByExternalId.get(sub.externalId!);
    if (!stat) continue;
    const e =
      metricsByCreator.get(sub.creatorId) ??
      ({ views: 0, likes: 0, comments: 0, shares: 0 } satisfies MetricSum);
    e.views += stat.views;
    e.likes += stat.likes;
    e.comments += stat.comments;
    e.shares += stat.shares;
    metricsByCreator.set(sub.creatorId, e);
  }

  // ── 5. 组装(候选名单驱动,缺数据补 0) ────────────────────
  const result: CreatorAggregate[] = [];
  for (const cid of creatorIds) {
    const info = creatorInfoMap.get(cid);
    if (!info) continue; // 创作者被删但仍留有 enrollment/submission(SetNull 后理论上不应到这,稳妥跳过)
    const sub = subCount.get(cid) ?? { total: 0, approved: 0 };
    const m = metricsByCreator.get(cid) ?? {
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
    };
    result.push({
      creatorId: cid,
      nickname: info.nickname,
      username: info.username,
      avatarUrl: info.avatarUrl,
      submissions: sub.total,
      approvedSubmissions: sub.approved,
      views: m.views,
      likes: m.likes,
      comments: m.comments,
      shares: m.shares,
    });
  }
  return result;
}
