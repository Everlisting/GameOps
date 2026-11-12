import { z } from "zod";
import { dateValue, nextDateValue } from "@/lib/data-period";
import { activityFiltersSchema } from "./filters";

export const videoMetrics = ["recommendedViews", "views", "likes", "comments", "shares", "fansGained"] as const;
export const numberFields = [...videoMetrics, "count", "maxRecommendedViews", "reward"] as const;
export const textFields = ["title", "platform", "creatorUid"] as const;
export const metricLabels: Record<(typeof numberFields)[number] | (typeof textFields)[number], string> = {
  recommendedViews: "推荐播放量", views: "播放量", likes: "点赞量", comments: "评论量",
  shares: "分享量", fansGained: "涨粉量", count: "稿件数", maxRecommendedViews: "单稿最高推荐播放量",
  reward: "当前奖励金额（元）", title: "视频标题", platform: "平台", creatorUid: "达人 UID",
};

const metric = z.enum(numberFields);
const money = z.number().min(0).max(10_000_000).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001, "金额最多两位小数");
const count = z.number().int().min(1).max(50_000);
const numericCondition = z.object({
  field: metric,
  op: z.enum(["gte", "gt", "lte", "lt", "eq"]),
  value: z.number().finite().min(-1e12).max(1e12),
});
const textCondition = z.object({
  field: z.enum(textFields),
  op: z.enum(["contains", "notContains", "equals"]),
  value: z.string().trim().min(1, "请输入匹配文字").max(160),
});
const conditions = z.union([numericCondition, textCondition]).array().min(1).max(12);
export const stepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("FILTER"), match: z.enum(["ALL", "ANY"]), conditions }),
  z.object({ kind: z.literal("GROUP") }),
  z.object({ kind: z.literal("LIMIT"), scope: z.enum(["AUTHOR", "POOL"]), metric, count }),
  z.object({ kind: z.literal("FIXED"), amount: money }),
  z.object({ kind: z.literal("TIER"), metric, tiers: z.array(z.object({ min: z.number().finite().min(0).max(1e12), amount: money })).min(1).max(40) }),
  z.object({ kind: z.literal("RANK"), metric, ranges: z.array(z.object({ from: count, to: count, amount: money })).min(1).max(40) }),
  z.object({ kind: z.literal("RATE"), metric, unit: z.number().int().min(1).max(1e9), amount: money }),
  z.object({ kind: z.literal("CAP"), amount: money }),
]);

export type RuleStep = z.infer<typeof stepSchema>;
export type RuleCondition = z.infer<typeof conditions>[number];
export type NumberField = (typeof numberFields)[number];
export const stepLabels: Record<RuleStep["kind"], string> = {
  FILTER: "按条件筛选", GROUP: "按达人汇总", LIMIT: "排序取前 N 项", FIXED: "固定金额",
  TIER: "按档位计奖", RANK: "按名次计奖", RATE: "按指标比例计奖", CAP: "奖励封顶",
};

const poolSchema = z.object({
  name: z.string().trim().min(1, "请输入奖池名称").max(80),
  exclusiveGroup: z.string().trim().max(40),
  steps: z.array(stepSchema).min(1).max(20),
});
export type RewardPool = z.infer<typeof poolSchema>;

const date = z.string().refine((s) => !!dateValue(s), "请选择有效日期");
const localCutoff = z.string().regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/).refine((s) => !!dateValue(s.slice(0, 10)), "请选择有效截止时间");
const activityBaseSchema = z.object({
  title: z.string().trim().min(1, "请输入活动标题").max(120),
  description: z.string().trim().max(3000),
  startDate: date,
  endDate: date,
  filters: activityFiltersSchema,
  settlementMode: z.enum(["CONFIRMATION", "CUTOFF"]),
  cutoffAt: localCutoff.nullable(),
  pools: z.array(poolSchema).min(1, "至少添加一个奖池").max(12),
});
export const specialMatchSchema = activityBaseSchema.pick({ startDate: true, endDate: true, filters: true })
  .refine((data) => data.startDate <= data.endDate, "活动结束日期必须不早于开始日期");
export const specialActivitySchema = activityBaseSchema.superRefine((data, ctx) => {
  function issue(message: string, path: (string | number)[]) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
  }
  if (data.startDate > data.endDate) issue("活动结束日期必须不早于开始日期", ["endDate"]);
  if (data.settlementMode === "CUTOFF" && (!data.cutoffAt || (dateValue(data.endDate) && data.cutoffAt < `${nextDateValue(data.endDate)}T00:00`))) {
    issue("数据截止时间须在活动结束日之后", ["cutoffAt"]);
  }
  const names = new Set<string>();
  data.pools.forEach((pool, poolIndex) => {
    const path = ["pools", poolIndex];
    if (names.has(pool.name)) issue("奖池名称不能重复", [...path, "name"]);
    names.add(pool.name);
    let grouped = false;
    let awarded = false;
    pool.steps.forEach((step, stepIndex) => {
      const stepPath = [...path, "steps", stepIndex];
      const invalid = (message: string) => issue(`${pool.name || `奖池 ${poolIndex + 1}`} · 步骤 ${stepIndex + 1}：${message}`, stepPath);
      function checkField(field: RuleCondition["field"]) {
        if (!grouped && (field === "count" || field === "maxRecommendedViews")) invalid("请先添加「按达人汇总」步骤");
        if (grouped && (field === "title" || field === "platform")) invalid("视频标题与平台条件应放在达人汇总前");
        if (field === "reward" && !awarded) invalid("当前奖励金额只能在计奖步骤之后使用");
      }
      switch (step.kind) {
        case "GROUP":
          if (grouped) invalid("一个奖池只能按达人汇总一次");
          grouped = true;
          break;
        case "FILTER":
          step.conditions.forEach((condition) => checkField(condition.field));
          break;
        case "LIMIT":
          checkField(step.metric);
          if (grouped && step.scope === "AUTHOR") invalid("汇总后每个达人只有一行，请使用全奖池排序");
          break;
        case "TIER":
          checkField(step.metric);
          if (new Set(step.tiers.map((tier) => tier.min)).size !== step.tiers.length) invalid("档位门槛不能重复");
          awarded = true;
          break;
        case "RANK": {
          checkField(step.metric);
          const ranges = [...step.ranges].sort((a, b) => a.from - b.from);
          if (ranges.some(({ from, to }) => from > to)) invalid("结束名次必须不小于开始名次");
          else if (ranges.some(({ from }, i) => i > 0 && from <= ranges[i - 1].to)) invalid("名次区间不能重叠");
          awarded = true;
          break;
        }
        case "RATE":
          checkField(step.metric);
          awarded = true;
          break;
        case "FIXED":
          awarded = true;
          break;
        case "CAP":
          if (!awarded) invalid("封顶须放在计奖步骤之后");
          break;
      }
    });
    if (!awarded) issue(`${pool.name || `奖池 ${poolIndex + 1}`}需要至少一个计奖步骤`, [...path, "steps"]);
  });
});

export type SpecialActivityInput = z.infer<typeof specialActivitySchema>;

export function newRuleStep(kind: RuleStep["kind"]): RuleStep {
  switch (kind) {
    case "FILTER": return { kind, match: "ALL", conditions: [{ field: "recommendedViews", op: "gte", value: 0 }] };
    case "GROUP": return { kind };
    case "LIMIT": return { kind, scope: "POOL", metric: "recommendedViews", count: 10 };
    case "FIXED": return { kind, amount: 0 };
    case "TIER": return { kind, metric: "recommendedViews", tiers: [{ min: 0, amount: 0 }] };
    case "RANK": return { kind, metric: "recommendedViews", ranges: [{ from: 1, to: 1, amount: 0 }] };
    case "RATE": return { kind, metric: "recommendedViews", unit: 1000, amount: 0 };
    case "CAP": return { kind, amount: 0 };
  }
}
