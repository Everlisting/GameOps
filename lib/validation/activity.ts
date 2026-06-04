import { z } from "zod";

// ── 创作者端 ─────────────────────────────────────────────
export const activityListQuerySchema = z.object({
  status: z.enum(["DRAFT", "ONGOING", "ENDED"]).optional(),
  scope: z.enum(["all", "visible"]).optional(),
});

// ── 运营端:激励规则(rewardRules JSON 内容) ──────────────
/**
 * 七类规则联合,可叠加(数组形式)。阶段3 仅做"配置 + Zod 校验 + 入库",
 * 实际 estimated 计算在阶段5 由引擎读取 JSON 实现。
 *
 *   TIER               阶梯档位 — 按 metric 落入哪一档拿对应金额
 *   FORMULA            公式因子 — 支持 metric/vars 的算术表达式(沙盒求值)
 *   SHARE_POOL         占比瓜分 — 总奖池按 weightField 加权分配,可选 topN
 *   RANK               排名奖 — 按 metric 排名落入区间拿奖,区间形如 [from..to]
 *   PER_SUBMISSION     单条稿件 — 每条稿件固定 amount,可选仅审核通过的稿件计数
 *   ACTIVITY_THRESHOLD 活动总数据满足 — 活动整体 metric 达到 threshold 给 amount
 *   BASE_PLUS_STEP     基础+步进 — 达到门槛给基础 amount,再按步长每超过 stepSize 加 stepAmount
 *
 * 每条规则都有可选 `cap`(激励上限,单位元)。不填 = 无上限。
 */
// 结算维度:四个互动数据 + 投稿条数(条数 = 该创作者在本活动下符合条件的稿件数)
export const REWARD_METRICS = [
  "views",
  "likes",
  "comments",
  "shares",
  "submissions",
] as const;
export const rewardMetricSchema = z.enum(REWARD_METRICS);

// 每条规则的激励上限(单位:元)。空值 = 无上限。引擎结算时取 min(计算值, cap)。
const capSchema = z
  .number()
  .positive("上限必须大于 0")
  .max(1_000_000_000, "上限过大")
  .optional();

/**
 * 每条规则的 CPM 上限(单位:元 / 千次播放)。空值 = 不限制。
 * 实际换算到金额上限 = cpmCap × 创作者播放量 / 1000。
 * 创作者 views=0(无播放数据)时不生效,沿用原值;不"惩罚"还没回流的创作者。
 *
 * 7 类规则都挂这个字段:配不配是运营自己的事;非播放量相关的规则(PER_SUBMISSION /
 * ACTIVITY_THRESHOLD)若运营配了 cpmCap,引擎也会按相同口径截一刀。
 */
const cpmCapSchema = z
  .number()
  .positive("CPM 上限必须大于 0")
  .max(1_000_000, "CPM 过大")
  .optional();

export const tierRuleSchema = z.object({
  kind: z.literal("TIER"),
  metric: rewardMetricSchema,
  tiers: z
    .array(
      z
        .object({
          min: z.number().int().nonnegative(),
          max: z.number().int().positive().optional(),
          amount: z.number().nonnegative(),
        })
        .refine((t) => t.max === undefined || t.max >= t.min, {
          message: "档位上限必须不小于下限",
          path: ["max"],
        }),
    )
    .min(1, "至少配置 1 档")
    .max(20, "最多配置 20 档"),
  cap: capSchema,
  cpmCap: cpmCapSchema,
});

/**
 * 自定义奖池(原"公式因子"):积木式编排,token 数组形式存盘,引擎按顺序串成表达式求值。
 *   - metric  结算值:views / likes / comments / shares
 *   - number  数值常数
 *   - op      运算符:+ - * / 与括号 ( )
 * UI 上让运营点按钮拼,不再写自由文本;表达力等价于原 expr 但消除了语法噪声。
 */
export const FORMULA_OPS = ["+", "-", "*", "/", "(", ")"] as const;
export const formulaOpSchema = z.enum(FORMULA_OPS);

export const formulaTokenSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("metric"), value: rewardMetricSchema }),
  z.object({
    type: z.literal("number"),
    value: z.number().refine((n) => Number.isFinite(n), "数值无效"),
  }),
  z.object({ type: z.literal("op"), value: formulaOpSchema }),
]);

export const formulaRuleSchema = z.object({
  kind: z.literal("FORMULA"),
  tokens: z
    .array(formulaTokenSchema)
    .min(1, "请至少添加 1 个积木")
    .max(60, "公式过长"),
  cap: capSchema,
  cpmCap: cpmCapSchema,
});

export type FormulaToken = z.infer<typeof formulaTokenSchema>;
export type FormulaOp = z.infer<typeof formulaOpSchema>;

export const sharePoolRuleSchema = z.object({
  kind: z.literal("SHARE_POOL"),
  pool: z.number().positive("奖池金额必须大于 0"),
  weightField: rewardMetricSchema,
  topN: z.number().int().positive().max(10000).optional(),
  cap: capSchema,
  cpmCap: cpmCapSchema,
});

export const rankRuleSchema = z.object({
  kind: z.literal("RANK"),
  metric: rewardMetricSchema,
  ranks: z
    .array(
      z
        .object({
          from: z.number().int().positive(),
          to: z.number().int().positive(),
          amount: z.number().nonnegative(),
        })
        .refine((r) => r.to >= r.from, {
          message: "末位排名不小于首位",
          path: ["to"],
        }),
    )
    .min(1, "至少配置 1 档排名")
    .max(20, "最多配置 20 档排名"),
  cap: capSchema,
  cpmCap: cpmCapSchema,
});

export const perSubmissionRuleSchema = z.object({
  kind: z.literal("PER_SUBMISSION"),
  amount: z.number().positive("单条金额必须大于 0"),
  approvedOnly: z.boolean().optional(), // true = 仅审核通过的稿件计数
  /**
   * 最小播放量门槛(≥);0 / 空 = 不过滤。
   * 设了之后,只有"该稿件 views >= minViews"的才计入。无 VideoStat 数据的稿件视为 views=0。
   */
  minViews: z.number().int().nonnegative().max(1_000_000_000).optional(),
  cap: capSchema,
  cpmCap: cpmCapSchema,
});

export const activityThresholdRuleSchema = z.object({
  kind: z.literal("ACTIVITY_THRESHOLD"),
  metric: rewardMetricSchema,
  threshold: z.number().int().positive("门槛必须大于 0"),
  amount: z.number().positive("奖励金额必须大于 0"),
  cap: capSchema,
  cpmCap: cpmCapSchema,
});

// 注:步进起点 < 触发门槛 在逻辑上没意义,但不做硬约束(discriminatedUnion 不接 .refine()),
// UI 上以提示文案引导;真正的非法输入由引擎结算时跳过。
export const basePlusStepRuleSchema = z.object({
  kind: z.literal("BASE_PLUS_STEP"),
  metric: rewardMetricSchema,
  baseThreshold: z.number().int().nonnegative("门槛必须不小于 0"),
  baseAmount: z.number().nonnegative("基础金额必须不小于 0"),
  stepStart: z.number().int().nonnegative("步进起点必须不小于 0"),
  stepSize: z.number().int().positive("步长必须大于 0"),
  stepAmount: z.number().nonnegative("每步金额必须不小于 0"),
  cap: capSchema,
  cpmCap: cpmCapSchema,
});

export const rewardRuleSchema = z.discriminatedUnion("kind", [
  tierRuleSchema,
  formulaRuleSchema,
  sharePoolRuleSchema,
  rankRuleSchema,
  perSubmissionRuleSchema,
  activityThresholdRuleSchema,
  basePlusStepRuleSchema,
]);

export const rewardRulesSchema = z
  .array(rewardRuleSchema)
  .max(10, "最多 10 条规则");

export type TierRule = z.infer<typeof tierRuleSchema>;
export type FormulaRule = z.infer<typeof formulaRuleSchema>;
export type SharePoolRule = z.infer<typeof sharePoolRuleSchema>;
export type RankRule = z.infer<typeof rankRuleSchema>;
export type PerSubmissionRule = z.infer<typeof perSubmissionRuleSchema>;
export type ActivityThresholdRule = z.infer<typeof activityThresholdRuleSchema>;
export type BasePlusStepRule = z.infer<typeof basePlusStepRuleSchema>;
export type RewardRule = z.infer<typeof rewardRuleSchema>;
export type RewardMetric = z.infer<typeof rewardMetricSchema>;

// ── 运营端:活动 CRUD ────────────────────────────────────
const datetimeLocalSchema = z
  .string()
  .min(1, "请填写时间")
  .refine((s) => !Number.isNaN(Date.parse(s)), "时间格式错误");

// 接受两种形式:
//   1) 站内上传后端返回的相对路径,形如 /uploads/activity-covers/<id>.<ext>
//   2) 兜底的外链 http(s)://...(老数据 / 临时手填仍能用)
const optionalCoverUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (s) =>
      s === "" ||
      /^https?:\/\//i.test(s) ||
      /^\/uploads\/[A-Za-z0-9._\-/]+$/.test(s),
    "封面必须是上传得到的站内路径或 http(s) 链接",
  )
  .optional()
  .transform((v) => (v === undefined || v === "" ? null : v));

const optionalDescription = z
  .string()
  .trim()
  .max(2000, "描述过长")
  .optional()
  .transform((v) => (v === undefined || v === "" ? null : v));

export const activityCreateSchema = z
  .object({
    name: z.string().trim().min(1, "请填写活动名称").max(120),
    description: optionalDescription,
    coverImage: optionalCoverUrl,
    startAt: datetimeLocalSchema,
    endAt: datetimeLocalSchema,
    rewardRules: rewardRulesSchema.default([]),
  })
  .refine((d) => new Date(d.endAt).getTime() > new Date(d.startAt).getTime(), {
    message: "结束时间必须晚于开始时间",
    path: ["endAt"],
  });

// publishAt(定时发布):仅草稿可写;空串 = 清除;不传 = 不动。
const optionalPublishAt = z
  .string()
  .optional()
  .nullable()
  .transform((v) => {
    if (v === undefined) return undefined; // 不动
    if (v === null || v === "") return null; // 清除
    return v;
  })
  .refine(
    (v) => v === undefined || v === null || !Number.isNaN(Date.parse(v)),
    "时间格式错误",
  );

export const activityUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: optionalDescription,
    coverImage: optionalCoverUrl,
    startAt: datetimeLocalSchema.optional(),
    endAt: datetimeLocalSchema.optional(),
    rewardRules: rewardRulesSchema.optional(),
    publishAt: optionalPublishAt,
  })
  .refine(
    (d) => {
      if (d.startAt && d.endAt)
        return new Date(d.endAt).getTime() > new Date(d.startAt).getTime();
      return true;
    },
    { message: "结束时间必须晚于开始时间", path: ["endAt"] },
  );

export const activityStatusSchema = z.object({
  status: z.enum(["DRAFT", "ONGOING", "ENDED"]),
});

export const operatorActivityListQuerySchema = z.object({
  status: z.enum(["DRAFT", "ONGOING", "ENDED"]).optional(),
  q: z.string().trim().optional(),
});

export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;
export type ActivityUpdateInput = z.infer<typeof activityUpdateSchema>;
