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
};

/** 一条规则对一个创作者的贡献明细 */
export type IncentiveContribution = {
  ruleIndex: number;
  kind: RewardRule["kind"];
  /** cap 截断前的原始计算值(可能为负;FORMULA 才会出负) */
  raw: number;
  /** 实际计入 estimated 的金额(已 cap 截断、已截负) */
  amount: number;
  /** 该规则的 cap;null = 无上限 */
  cap: number | null;
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

function capAmount(
  raw: number,
  cap: number | undefined,
): { amount: number; cap: number | null } {
  const clamped = Math.max(0, raw);
  if (cap == null) return { amount: clamped, cap: null };
  return { amount: Math.min(clamped, cap), cap };
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
// 第一个 (min,max] 命中区间生效;tiers 顺序运营端自己排,不强制升序。
function applyTier(
  rule: TierRule,
  ruleIndex: number,
  creators: CreatorMetrics[],
): Map<string, IncentiveContribution> {
  const out = new Map<string, IncentiveContribution>();
  for (const c of creators) {
    const v = getMetric(c, rule.metric);
    const hit = rule.tiers.find(
      (t) => v >= t.min && (t.max == null || v <= t.max),
    );
    if (!hit) continue;
    const { amount, cap } = capAmount(hit.amount, rule.cap);
    out.set(c.creatorId, {
      ruleIndex,
      kind: "TIER",
      raw: hit.amount,
      amount,
      cap,
      note: `命中 [${hit.min}, ${hit.max ?? "∞"}]`,
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
    const { amount, cap } = capAmount(raw, rule.cap);
    out.set(c.creatorId, {
      ruleIndex,
      kind: "FORMULA",
      raw,
      amount,
      cap,
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
    const { amount, cap } = capAmount(raw, rule.cap);
    out.set(c.creatorId, {
      ruleIndex,
      kind: "SHARE_POOL",
      raw,
      amount,
      cap,
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
    const { amount, cap } = capAmount(hit.amount, rule.cap);
    out.set(c.creatorId, {
      ruleIndex,
      kind: "RANK",
      raw: hit.amount,
      amount,
      cap,
      note: `第 ${rank} 名`,
    });
  }
  return out;
}

// ── PER_SUBMISSION ─────────────────────────────────────────
function applyPerSubmission(
  rule: PerSubmissionRule,
  ruleIndex: number,
  creators: CreatorMetrics[],
): Map<string, IncentiveContribution> {
  const out = new Map<string, IncentiveContribution>();
  for (const c of creators) {
    const count = rule.approvedOnly ? c.approvedSubmissions : c.submissions;
    if (count <= 0) continue;
    const raw = count * rule.amount;
    const { amount, cap } = capAmount(raw, rule.cap);
    out.set(c.creatorId, {
      ruleIndex,
      kind: "PER_SUBMISSION",
      raw,
      amount,
      cap,
      note: `${count} 条稿件`,
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
    const { amount, cap } = capAmount(perCreator, rule.cap);
    out.set(c.creatorId, {
      ruleIndex,
      kind: "ACTIVITY_THRESHOLD",
      raw: perCreator,
      amount,
      cap,
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
    const { amount, cap } = capAmount(raw, rule.cap);
    out.set(c.creatorId, {
      ruleIndex,
      kind: "BASE_PLUS_STEP",
      raw,
      amount,
      cap,
      note: `metric=${v}`,
    });
  }
  return out;
}

/** 仅测试用 */
export const _testing = { evalFormula };
