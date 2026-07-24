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
import { requireRole } from "@/lib/rbac";
import { badRequest } from "@/lib/errors";
import { computeActivityIncentives } from "@/lib/incentive/compute";

export const POST = route(async (_req, { params }) => {
  const session = await requireRole("OPERATOR");
  const activityId = params?.id ?? "";
  if (!activityId) throw badRequest("缺少活动 id");

  const summary = await computeActivityIncentives(activityId, {
    id: session.sub,
    username: session.username,
  });

  return Response.json({
    ok: true,
    summary: {
      creatorsCount: summary.creatorsCount,
      totalEstimated: summary.totalEstimated,
      durationMs: summary.durationMs,
      rulesCount: summary.rulesCount,
    },
  });
});
