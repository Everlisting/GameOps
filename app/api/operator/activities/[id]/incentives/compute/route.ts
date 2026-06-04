/**
 * POST /api/operator/activities/[id]/incentives/compute
 *   运营触发全活动重算预估激励。
 *
 * 流程:
 *   1. 读 Activity + rewardRules(Zod 校验 JSON)
 *   2. aggregateActivityMetrics → CreatorMetrics[]
 *   3. computeIncentives → 每人 estimated + breakdown
 *   4. 对每个候选创作者 upsert Incentive
 *      - 已有人工 adjusted 的行:只刷新 estimated/breakdown/computedAt,不动 adjusted
 *      - 计算出 0 元的也写一条(便于 UI 看见"参与但没拿到")
 *   5. 写 AuditLog(action="incentive.compute",details 装规则数 / 创作者数 / 总额)
 *
 * 返回:summary(总数 / 总额 / 用时)
 */
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { badRequest, notFound } from "@/lib/errors";
import { rewardRulesSchema } from "@/lib/validation/activity";
import { aggregateActivityMetrics } from "@/lib/incentive/aggregate";
import { computeIncentives } from "@/lib/incentive/engine";
import { incentiveDb } from "@/lib/incentive/db";
import { recordAudit } from "@/lib/audit";

export const POST = route(async (_req, { params }) => {
  const session = await requireRole("OPERATOR");
  const activityId = params?.id ?? "";
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
            creatorId_activityId: {
              creatorId: c.creatorId,
              activityId,
            },
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

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "incentive.compute",
    targetType: "activity",
    targetId: activityId,
    details: {
      activityName: activity.name,
      rulesCount: rules.length,
      creatorsCount: entries.length,
      totalEstimated: Number(totalEstimated.toFixed(2)),
      durationMs,
    },
  });

  return Response.json({
    ok: true,
    summary: {
      creatorsCount: entries.length,
      totalEstimated: Number(totalEstimated.toFixed(2)),
      durationMs,
      rulesCount: rules.length,
    },
  });
});
