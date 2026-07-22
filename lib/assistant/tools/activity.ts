/**
 * 阶段10.2 · AI 助手 · 活动 / 激励工具(只读)。
 * 激励口径复用现有:候选=报名∪投稿、hidden 已排除(见 lib/incentive/aggregate.ts / Incentive 表)。
 */
import { tool } from "ai";

import { prisma } from "@/lib/db";
import { TOOL_DEFS } from "@/lib/assistant/tools/schemas";

export function activitySummaryTool() {
  return tool({
    description: TOOL_DEFS.activitySummary.description,
    inputSchema: TOOL_DEFS.activitySummary.input,
    execute: async (input) => {
      if (!input.activityId) {
        const activities = await prisma.activity.findMany({
          orderBy: { startAt: "desc" },
          take: 20,
          select: { id: true, name: true, status: true, startAt: true, endAt: true },
        });
        return {
          data: { activities },
          asOf: new Date().toISOString(),
          source: "Activity",
          links: ["/operator/activities"],
        };
      }
      const act = await prisma.activity.findUnique({
        where: { id: input.activityId },
        select: { id: true, name: true, status: true, startAt: true, endAt: true },
      });
      if (!act) {
        return { data: null, note: "活动不存在", asOf: new Date().toISOString(), source: "Activity" };
      }
      const [enroll, submissions, approved, incentiveAgg] = await Promise.all([
        prisma.activityEnrollment.count({ where: { activityId: act.id } }),
        prisma.submission.count({ where: { activityId: act.id } }),
        prisma.submission.count({ where: { activityId: act.id, status: "APPROVED" } }),
        prisma.incentive.aggregate({ where: { activityId: act.id }, _sum: { estimated: true } }),
      ]);
      return {
        data: {
          ...act,
          enroll,
          submissions,
          approved,
          incentiveEstimatedTotal: incentiveAgg._sum.estimated ? Number(incentiveAgg._sum.estimated) : 0,
        },
        asOf: new Date().toISOString(),
        source: "Activity + Enrollment + Submission + Incentive",
        links: [`/operator/activities/${act.id}`],
      };
    },
  });
}

export function incentiveExplainTool() {
  return tool({
    description: TOOL_DEFS.incentiveExplain.description,
    inputSchema: TOOL_DEFS.incentiveExplain.input,
    execute: async (input) => {
      const rows = await prisma.incentive.findMany({
        where: {
          activityId: input.activityId,
          ...(input.creatorId ? { creatorId: input.creatorId } : {}),
        },
        take: input.creatorId ? 1 : 50,
        select: {
          creatorId: true,
          estimated: true,
          adjusted: true,
          breakdown: true,
          computedAt: true,
          creator: { select: { nickname: true } },
        },
      });
      return {
        data: rows.map((r) => ({
          creatorId: r.creatorId,
          nickname: r.creator?.nickname ?? null,
          estimated: Number(r.estimated),
          adjusted: r.adjusted != null ? Number(r.adjusted) : null,
          breakdown: r.breakdown,
          computedAt: r.computedAt,
        })),
        asOf: rows[0]?.computedAt?.toISOString() ?? null,
        scope: { activityId: input.activityId, creatorId: input.creatorId ?? null },
        source: "Incentive(候选=报名∪投稿, hidden 已排除)",
        links: [`/operator/activities/${input.activityId}`],
      };
    },
  });
}
