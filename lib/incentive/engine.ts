/**
 * 激励引擎 · 纯函数。
 *
 * 输入:
 *   - rules:活动 rewardRules JSON 经 Zod 校验后的 RewardRule[]
 *   - creators:每个参与创作者在本活动下的聚合维度数据(views/likes/.../submissions)
 *
 * 输出:
 *   - Map<creatorId, CreatorIncentive>
 *       estimated  各规则贡献(按 cap 截断后)之和
 *       breakdown  每条规则的贡献明细,前端可展开看"为什么算出这个数"
 *
 * 规则之间相互独立。同一规则可能对部分创作者无贡献(未命中档位 / 不在 topN 等),
 * 此时不进 breakdown(避免一堆 0 噪声)。
 *
 * 浮点结果四舍五入到分;cap 截断在每条规则各自完成,引擎不做"全局 cap"。
 */
import type {
  ActivityThresholdRule,
  BasePlusStepRule,
  FormulaRule,
  FormulaToken,
  PerSubmissionRule,
  RankRule,
  RewardMetric,
  RewardRule,
  SharePoolRule,
  TierRule,
} from "@/lib/validation/activity";

/** 单个创作者在本活动下的聚合数据 */
export type CreatorMetrics = {
  creatorId: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  /** 投稿条数(全部状态) */
  submissions: number;
  /** 已通过的投稿条数 */
  approvedSubmissions: number;
  /**
   * 单条投稿明细(只填能拿到的;无 VideoStat 数据的稿件 views=0)。
   * PER_SUBMISSION 的 minViews / approvedOnly 在这里过滤。
   * 引擎对此字段宽容:不提供时按计数模式工作(submissions / approvedSubmissions)。
   */
  submissionViews?: Array<{ approved: boolean; views: number }>;
};

/** 一条规则对一个创作者的贡献明细 */
export type IncentiveContribution = {
  ruleIndex: number;
  kind: RewardRule["kind"];
  /** cap 截断前的原始计算值(可能为负;FORMULA 才会出负) */
  raw: number;
  /** 实际计入 estimated 的金额(已 cap / cpmCap 截断、已截负) */
  amount: number;
  /** 该规则的金额上限;null = 无上限 */
  cap: number | null;
  /** 该规则的 CPM 上限(元/千播放);null = 无上限 */
  cpmCap: number | null;
  /** cpmCap 换算到金额后的实际上限 = cpmCap × views / 1000;null = 未设 cpmCap 或 views=0 不生效 */
  cpmLimit: number | null;
  /** 实际截断该贡献的上限来源(便于 UI 标"被 CPM 截"); */
  cappedBy?: "cap" | "cpm";
  /** 触发说明(命中档位 / 排名 / 占比 等),供前端展示 */
  note?: string;
};

export type CreatorIncentive = {
  creatorId: string;
  estimated: number;
  breakdown: IncentiveContribution[];
};

export type ComputeResult = Map<string, CreatorIncentive>;

/** 主入口:吃 rules + 全员数据,产出 estimated map(以 creatorId 索引) */
export function computeIncentives(
  rules: RewardRule[],
  creators: CreatorMetrics[],
): ComputeResult {
  const out: ComputeResult = new Map();
  for (const c of creators) {
    out.set(c.creatorId, {
      creatorId: c.creatorId,
      estimated: 0,
      breakdown: [],
    });
  }
  if (creators.length === 0) return out;

  rules.forEach((rule, idx) => {
    const contribs = applyRule(rule, idx, creators);
    for (const [cid, contrib] of contribs) {
      const acc = out.get(cid);
      if (!acc) continue;
      acc.breakdown.push(contrib);
      acc.estimated += contrib.amount;
    }
  });

  for (const v of out.values()) v.estimated = round2(v.estimated);
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getMetric(c: CreatorMetrics, m: RewardMetric): number {
  switch (m) {
    case "views":
      return c.views;
    case "likes":
      return c.likes;
    case "comments":
      return c.comments;
    case "shares":
      return c.shares;
    case "submissions":
      return c.submissions;
  }
}

/**
 * 应用上限链:截负 → 取 min(raw, cap, cpmCap × views / 1000)。
 * 返回 amount + 元信息(供 breakdown 展示哪个上限触发了)。
 *
 * cpmCap 在 views=0(创作者没播放数据)时不生效,放过原值。这是产品决策:
 * 不想用"还没采集到播放数据"这个事去惩罚创作者。
 */
function applyLimits(
  raw: number,
  views: number,
  cap: number | undefined,
  cpmCap: number | undefined,
): {
  amount: number;
  cap: number | null;
  cpmCap: number | null;
  cpmLimit: number | null;
  cappedBy?: "cap" | "cpm";
} {
  const clamped = Math.max(0, raw);
  const cpmLimit =
    cpmCap != null && views > 0 ? (cpmCap * views) / 1000 : null;

  // 找最紧的那一个
  let amount = clamped;
  let cappedBy: "cap" | "cpm" | undefined;
  if (cap != null && cap < amount) {
    amount = cap;
    cappedBy = "cap";
  }
  if (cpmLimit != null && cpmLimit < amount) {
    amount = cpmLimit;
    cappedBy = "cpm";
  }

  return {
    amount,
    cap: cap ?? null,
    cpmCap: cpmCap ?? null,
    cpmLimit,
    cappedBy,
  };
}

function applyRule(
  rule: RewardRule,
  ruleIndex: number,
  creators: CreatorMetrics[],
): Map<string, IncentiveContribution> {
  switch (rule.kind) {
    case "TIER":
      return applyTier(rule, ruleIndex, creators);
    case "FORMULA":
      return applyFormula(rule, ruleIndex, creators);
    case "SHARE_POOL":
      return applySharePool(rule, ruleIndex, creators);
    case "RANK":
      return applyRank(rule, ruleIndex, creators);
    case "PER_SUBMISSION":
      return applyPerSubmission(rule, ruleIndex, creators);
    case "ACTIVITY_THRESHOLD":
      return applyActivityThreshold(rule, ruleIndex, creators);
    case "BASE_PLUS_STEP":
      return applyBasePlusStep(rule, ruleIndex, creators);
  }
}

// ── TIER ───────────────────────────────────────────────────
// 区间语义 (min, max]:下限严格 >,上限闭合。
// 例:tier(100, 999) 表示 metric 严格大于 100 且 <= 999 才命中。
// 想包含 0 的"零档"用 (-1, X] 之类绕(目前 schema min 不允许负;0 档建议另起一条 ACTIVITY_THRESHOLD 之类)。
// tiers 顺序运营端自己排,不强制升序;取第一个命中。
function applyTier(
  rule: TierRule,
  ruleIndex: number,
  creators: CreatorMetrics[],
): Map<string, IncentiveContribution> {
  const out = new Map<string, IncentiveContribution>();
  for (const c of creators) {
    const v = getMetric(c, rule.metric);
    const hit = rule.tiers.find(
      (t) => v > t.min && (t.max == null || v <= t.max),
    );
    if (!hit) continue;
    const lim = applyLimits(hit.amount, c.views, rule.cap, rule.cpmCap);
    out.set(c.creatorId, {
      ruleIndex,
      kind: "TIER",
      raw: hit.amount,
      ...lim,
      note: `命中 (${hit.min}, ${hit.max ?? "∞"}]`,
    });
  }
  return out;
}

// ── FORMULA ────────────────────────────────────────────────
// shunting-yard 转 RPN 求值;token 已被 Zod 收窄,无 eval / Function 风险。
// 除零 → 0,负值 → cap 时截到 0。
function applyFormula(
  rule: FormulaRule,
  ruleIndex: number,
  creators: CreatorMetrics[],
): Map<string, IncentiveContribution> {
  const out = new Map<string, IncentiveContribution>();
  for (const c of creators) {
    let raw = 0;
    try {
      const r = evalFormula(rule.tokens, c);
      raw = Number.isFinite(r) ? r : 0;
    } catch {
      raw = 0;
    }
    const lim = applyLimits(raw, c.views, rule.cap, rule.cpmCap);
    out.set(c.creatorId, {
      ruleIndex,
      kind: "FORMULA",
      raw,
      ...lim,
    });
  }
  return out;
}

const PRECEDENCE: Record<string, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
};

function evalFormula(tokens: FormulaToken[], c: CreatorMetrics): number {
  type RpnTok = { type: "num"; value: number } | { type: "op"; op: string };
  const output: RpnTok[] = [];
  const stack: string[] = [];

  for (const t of tokens) {
    if (t.type === "metric") {
      output.push({ type: "num", value: getMetric(c, t.value) });
      continue;
    }
    if (t.type === "number") {
      output.push({ type: "num", value: t.value });
      continue;
    }
    // op
    const op = t.value;
    if (op === "(") {
      stack.push(op);
    } else if (op === ")") {
      while (stack.length && stack[stack.length - 1] !== "(") {
        output.push({ type: "op", op: stack.pop()! });
      }
      if (stack[stack.length - 1] !== "(") throw new Error("括号不匹配");
      stack.pop();
    } else {
      while (
        stack.length &&
        stack[stack.length - 1] !== "(" &&
        PRECEDENCE[stack[stack.length - 1]!]! >= PRECEDENCE[op]!
      ) {
        output.push({ type: "op", op: stack.pop()! });
      }
      stack.push(op);
    }
  }
  while (stack.length) {
    const op = stack.pop()!;
    if (op === "(") throw new Error("括号不匹配");
    output.push({ type: "op", op });
  }

  const evalStack: number[] = [];
  for (const tok of output) {
    if (tok.type === "num") {
      evalStack.push(tok.value);
      continue;
    }
    const b = evalStack.pop();
    const a = evalStack.pop();
    if (a == null || b == null) throw new Error("表达式无效");
    switch (tok.op) {
      case "+":
        evalStack.push(a + b);
        break;
      case "-":
        evalStack.push(a - b);
        break;
      case "*":
        evalStack.push(a * b);
        break;
      case "/":
        evalStack.push(b === 0 ? 0 : a / b);
        break;
    }
  }
  return evalStack.length === 1 ? evalStack[0]! : 0;
}

// ── SHARE_POOL ─────────────────────────────────────────────
// 按 weightField 加权瓜分 pool;weight=0 不参与;可选 topN 进一步截断。
function applySharePool(
  rule: SharePoolRule,
  ruleIndex: number,
  creators: CreatorMetrics[],
): Map<string, IncentiveContribution> {
  const out = new Map<string, IncentiveContribution>();
  const sorted = creators
    .map((c) => ({ c, w: getMetric(c, rule.weightField) }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w);

  const participants = rule.topN ? sorted.slice(0, rule.topN) : sorted;
  const total = participants.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return out;

  for (const { c, w } of participants) {
    const raw = (w / total) * rule.pool;
    const lim = applyLimits(raw, c.views, rule.cap, rule.cpmCap);
    out.set(c.creatorId, {
      ruleIndex,
      kind: "SHARE_POOL",
      raw,
      ...lim,
      note: `权重 ${w}/${total}`,
    });
  }
  return out;
}

// ── RANK ───────────────────────────────────────────────────
// 竞赛排名(1, 2, 2, 4):同值同名,后续跳号。
function applyRank(
  rule: RankRule,
  ruleIndex: number,
  creators: CreatorMetrics[],
): Map<string, IncentiveContribution> {
  const out = new Map<string, IncentiveContribution>();
  const sorted = creators
    .map((c) => ({ c, v: getMetric(c, rule.metric) }))
    .sort((a, b) => b.v - a.v);

  const ranks: { c: CreatorMetrics; rank: number }[] = [];
  let lastValue: number | null = null;
  let lastRank = 0;
  sorted.forEach((x, i) => {
    const rank = lastValue === x.v ? lastRank : i + 1;
    lastValue = x.v;
    lastRank = rank;
    ranks.push({ c: x.c, rank });
  });

  for (const { c, rank } of ranks) {
    const hit = rule.ranks.find((r) => rank >= r.from && rank <= r.to);
    if (!hit) continue;
    const lim = applyLimits(hit.amount, c.views, rule.cap, rule.cpmCap);
    out.set(c.creatorId, {
      ruleIndex,
      kind: "RANK",
      raw: hit.amount,
      ...lim,
      note: `第 ${rank} 名`,
    });
  }
  return out;
}

// ── PER_SUBMISSION ─────────────────────────────────────────
// 数稿件 × 单条金额。两个可选过滤:
//   - approvedOnly:只数 APPROVED 的稿件
//   - minViews:只数 views ≥ minViews 的稿件(需要 submissionViews 明细;没明细则降级用 submissions 计数)
// 同时设了两个 → AND(既要 APPROVED,又要 views 达标)。
function applyPerSubmission(
  rule: PerSubmissionRule,
  ruleIndex: number,
  creators: CreatorMetrics[],
): Map<string, IncentiveContribution> {
  const out = new Map<string, IncentiveContribution>();
  const usesMinViews = rule.minViews != null && rule.minViews > 0;

  for (const c of creators) {
    let count: number;
    let noteFilters: string[] = [];

    if (usesMinViews && c.submissionViews) {
      // 明细模式:逐条过滤
      count = c.submissionViews.filter((s) => {
        if (rule.approvedOnly && !s.approved) return false;
        if (s.views < (rule.minViews ?? 0)) return false;
        return true;
      }).length;
      noteFilters.push(`播放量 ≥ ${rule.minViews}`);
      if (rule.approvedOnly) noteFilters.push("已通过");
    } else {
      // 计数模式:approvedOnly 切换 approvedSubmissions / submissions
      count = rule.approvedOnly ? c.approvedSubmissions : c.submissions;
      if (rule.approvedOnly) noteFilters.push("已通过");
      // minViews 配了但没明细 → 标注一下,运营能从 UI 看出"明细缺,过滤未生效"
      if (usesMinViews && !c.submissionViews) {
        noteFilters.push(`(minViews 已配但缺播放明细)`);
      }
    }

    if (count <= 0) continue;
    const raw = count * rule.amount;
    const lim = applyLimits(raw, c.views, rule.cap, rule.cpmCap);
    const filterTag = noteFilters.length ? ` · ${noteFilters.join(" · ")}` : "";
    out.set(c.creatorId, {
      ruleIndex,
      kind: "PER_SUBMISSION",
      raw,
      ...lim,
      note: `${count} 条稿件${filterTag}`,
    });
  }
  return out;
}

// ── ACTIVITY_THRESHOLD ─────────────────────────────────────
// 活动整体 metric 达标 → amount 平均分给所有参与创作者。
// (架构注释里说"由结算策略决定如何分发",这里采用最简单的均分;运营反馈再调。)
function applyActivityThreshold(
  rule: ActivityThresholdRule,
  ruleIndex: number,
  creators: CreatorMetrics[],
): Map<string, IncentiveContribution> {
  const out = new Map<string, IncentiveContribution>();
  if (creators.length === 0) return out;
  const total = creators.reduce((s, c) => s + getMetric(c, rule.metric), 0);
  if (total < rule.threshold) return out;
  const perCreator = rule.amount / creators.length;
  for (const c of creators) {
    const lim = applyLimits(perCreator, c.views, rule.cap, rule.cpmCap);
    out.set(c.creatorId, {
      ruleIndex,
      kind: "ACTIVITY_THRESHOLD",
      raw: perCreator,
      ...lim,
      note: `活动总 ${total} ≥ ${rule.threshold},均分到 ${creators.length} 人`,
    });
  }
  return out;
}

// ── BASE_PLUS_STEP ─────────────────────────────────────────
// metric < baseThreshold → 0
// metric ≥ baseThreshold → baseAmount + max(0, floor((metric - stepStart)/stepSize)) * stepAmount
// "超过 stepStart 之后才起步进";stepStart 通常 ≥ baseThreshold。
function applyBasePlusStep(
  rule: BasePlusStepRule,
  ruleIndex: number,
  creators: CreatorMetrics[],
): Map<string, IncentiveContribution> {
  const out = new Map<string, IncentiveContribution>();
  for (const c of creators) {
    const v = getMetric(c, rule.metric);
    if (v < rule.baseThreshold) continue;
    let raw = rule.baseAmount;
    if (v > rule.stepStart && rule.stepSize > 0) {
      const steps = Math.floor((v - rule.stepStart) / rule.stepSize);
      raw += steps * rule.stepAmount;
    }
    const lim = applyLimits(raw, c.views, rule.cap, rule.cpmCap);
    out.set(c.creatorId, {
      ruleIndex,
      kind: "BASE_PLUS_STEP",
      raw,
      ...lim,
      note: `metric=${v}`,
    });
  }
  return out;
}

/** 仅测试用 */
export const _testing = { evalFormula };
