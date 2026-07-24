/**
 * 全活动重算预估激励的核心逻辑(从 route handler 抽出,供 route 与「审批执行器」共用)。
 *
 * 流程(与原 route 一致,行为不变):
 *   1. 读 Activity + rewardRules(Zod 校验 JSON)
 *   2. aggregateActivityMetrics → CreatorMetrics[]
 *   3. computeIncentives → 每人 estimated + breakdown
 *   4. 对每个候选创作者 upsert Incentive(人工 adjusted 不动)
 *   5. 写 AuditLog(action="incentive.compute")
 */
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { rewardRulesSchema } from "@/lib/validation/activity";
import { aggregateActivityMetrics } from "@/lib/incentive/aggregate";
import { computeIncentives } from "@/lib/incentive/engine";
import { incentiveDb } from "@/lib/incentive/db";
import { recordAudit } from "@/lib/audit";

export interface ComputeActor {
  /** 操作人 user.id;null = 系统 */
  id: string | null;
  username: string;
}

export interface ComputeSummary {
  activityName: string;
  creatorsCount: number;
  totalEstimated: number;
  durationMs: number;
  rulesCount: number;
}

/** 轻量预检:活动存在性 + 规则合法性 + 规则数/稿件数/参与人数(供审批卡片展示,不跑聚合)。 */
export async function previewActivityCompute(activityId: string): Promise<{
  activityName: string;
  rulesCount: number;
  submissionsCount: number;
  candidateCount: number;
}> {
  if (!activityId) throw badRequest("缺少活动 id");
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { name: true, rewardRules: true },
  });
  if (!activity) throw notFound("活动不存在");
  const parsed = rewardRulesSchema.safeParse(activity.rewardRules);
  if (!parsed.success) throw badRequest("活动激励规则配置不合法,请重新编辑后再算");

  // 候选 = 报名 ∪ 投稿(去重创作者);稿件数 = 投稿数。轻量计数,不跑激励聚合。
  const [enrolls, subs] = await Promise.all([
    prisma.activityEnrollment.findMany({ where: { activityId }, select: { creatorId: true } }),
    prisma.submission.findMany({ where: { activityId }, select: { creatorId: true } }),
  ]);
  const candidateCount = new Set([...enrolls, ...subs].map((x) => x.creatorId)).size;

  return {
    activityName: activity.name,
    rulesCount: parsed.data.length,
    submissionsCount: subs.length,
    candidateCount,
  };
}

/** 全活动重算预估激励。幂等:重复执行覆盖 estimated/breakdown/computedAt,不动人工 adjusted。 */
export async function computeActivityIncentives(
  activityId: string,
  actor: ComputeActor,
): Promise<ComputeSummary> {
  if (!activityId) throw badRequest("缺少活动 id");

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { id: true, name: true, rewardRules: true },
  });
  if (!activity) throw notFound("活动不存在");

  const parsedRules = rewardRulesSchema.safeParse(activity.rewardRules);
  if (!parsedRules.success) {
    throw badRequest("活动激励规则配置不合法,请重新编辑后再算");
  }
  const rules = parsedRules.data;

  const startedAt = Date.now();
  const aggregates = await aggregateActivityMetrics(activityId);
  const computed = computeIncentives(
    rules,
    aggregates.map((a) => ({
      creatorId: a.creatorId,
      views: a.views,
      likes: a.likes,
      comments: a.comments,
      shares: a.shares,
      submissions: a.submissions,
      approvedSubmissions: a.approvedSubmissions,
      submissionViews: a.submissionViews,
    })),
  );

  // 批量 upsert;并发 8,避免单次太多串行慢
  const entries = Array.from(computed.values());
  let totalEstimated = 0;
  const concurrency = 8;
  for (let i = 0; i < entries.length; i += concurrency) {
    const slice = entries.slice(i, i + concurrency);
    await Promise.all(
      slice.map(async (c) => {
        totalEstimated += c.estimated;
        await incentiveDb.upsert({
          where: {
            creatorId_activityId: { creatorId: c.creatorId, activityId },
          },
          create: {
            creatorId: c.creatorId,
            activityId,
            estimated: c.estimated,
            breakdown: c.breakdown,
            computedAt: new Date(),
          },
          update: {
            estimated: c.estimated,
            breakdown: c.breakdown,
            computedAt: new Date(),
            // 注意:adjusted/adjustedBy/adjustReason 故意不动,人工调整在重算时保留
          },
        });
      }),
    );
  }

  const durationMs = Date.now() - startedAt;
  const summary: ComputeSummary = {
    activityName: activity.name,
    creatorsCount: entries.length,
    totalEstimated: Number(totalEstimated.toFixed(2)),
    durationMs,
    rulesCount: rules.length,
  };

  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "incentive.compute",
    targetType: "activity",
    targetId: activityId,
    details: {
      activityName: summary.activityName,
      rulesCount: summary.rulesCount,
      creatorsCount: summary.creatorsCount,
      totalEstimated: summary.totalEstimated,
      durationMs: summary.durationMs,
    },
  });

  return summary;
}
