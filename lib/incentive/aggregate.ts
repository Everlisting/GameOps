/**
 * 单活动 · 聚合层 · 把 DB 状态压成引擎所需的 CreatorMetrics[]。
 *
 * 候选创作者 = 本活动有「报名记录」或「投稿记录」的并集
 *   (有人不报名直接投稿,也有人报名后没投;两条都要纳入结算视野)
 *
 * 指标聚合口径(v1):
 *   - submissions          本活动下该创作者的全部投稿条数(不分状态)
 *   - approvedSubmissions  status=APPROVED 的条数
 *   - views/likes/comments/shares  ── 创作者维度的总量,从 APPROVED + douyin + 有 externalId 的稿件 join VideoStat 加总
 *   - submissionViews      ── 单条稿件维度的明细;每条 = { approved, views },views 来自 VideoStat(没 VideoStat 视为 0)
 *                             给 PER_SUBMISSION.minViews / approvedOnly 过滤用。
 *                             非 douyin / 无 externalId 的稿件:views=0(没数据源,符合"达不到 minViews"语义)
 *
 * 非抖音平台暂时互动数据都是 0(数据源还没接);PER_SUBMISSION 之类"数稿件"规则照常生效。
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

  // ── 4. 抖音稿件 VideoStat:覆盖全部 douyin + 有 externalId 的稿件(不只是 APPROVED) ─
  // 创作者维度互动数据仍按"approved 才算"口径累加;
  // 单条明细 submissionViews 则保留全部状态,供 PER_SUBMISSION.minViews/approvedOnly 自由过滤。
  const douyinSubs = allSubs.filter(
    (s) => s.platform === "douyin" && s.externalId,
  );
  const externalIds = Array.from(
    new Set(douyinSubs.map((s) => s.externalId!)),
  );

  const stats =
    externalIds.length > 0
      ? await prisma.videoStat.findMany({
          // hidden(达人删除/隐藏)的作品不参与任何激励计算
          where: { platform: "douyin", externalId: { in: externalIds }, hidden: false },
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
  const submissionViewsByCreator = new Map<
    string,
    Array<{ approved: boolean; views: number }>
  >();

  // 先把所有稿件(含非抖音)按 creator 分组进 submissionViews,views 默认 0
  for (const s of allSubs) {
    const list = submissionViewsByCreator.get(s.creatorId) ?? [];
    let views = 0;
    if (s.platform === "douyin" && s.externalId) {
      const stat = statByExternalId.get(s.externalId);
      if (stat) views = stat.views;
    }
    list.push({ approved: s.status === "APPROVED", views });
    submissionViewsByCreator.set(s.creatorId, list);
  }

  // 创作者总互动量:仅 APPROVED + douyin + 有 VideoStat 的累加
  for (const sub of douyinSubs) {
    if (sub.status !== "APPROVED") continue;
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
      submissionViews: submissionViewsByCreator.get(cid) ?? [],
    });
  }
  return result;
}
