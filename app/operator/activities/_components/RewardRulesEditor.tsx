"use client";

/**
 * 激励规则编辑器:七类规则可叠加,数组形式。
 *   - TIER               阶梯档位 — metric + tiers[]
 *   - FORMULA            自定义奖池 — tokens[](积木式编排)
 *   - SHARE_POOL         占比瓜分 — pool + weightField + topN?
 *   - RANK               排名奖 — metric + ranks[]
 *   - PER_SUBMISSION     单条稿件 — amount + approvedOnly?
 *   - ACTIVITY_THRESHOLD 活动总数据满足 — metric + threshold + amount
 *   - BASE_PLUS_STEP     基础+步进 — metric + baseThreshold + baseAmount + stepStart + stepSize + stepAmount
 *
 * 每条规则尾部统一渲染 cap(激励上限,元),空 = 无上限。
 * 由 ActivityForm 持有状态。本组件只做受控渲染 + 增删改。
 */
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FORMULA_OPS } from "@/lib/validation/activity";
import type {
  ActivityThresholdRule,
  BasePlusStepRule,
  FormulaOp,
  FormulaRule,
  FormulaToken,
  PerSubmissionRule,
  RankRule,
  RewardMetric,
  RewardRule,
  SharePoolRule,
  TierRule,
} from "@/lib/validation/activity";

const METRICS: { value: RewardMetric; label: string }[] = [
  { value: "views", label: "播放量" },
  { value: "likes", label: "点赞数" },
  { value: "comments", label: "评论数" },
  { value: "shares", label: "分享数" },
  { value: "submissions", label: "条数" },
];

const KIND_LABEL: Record<RewardRule["kind"], string> = {
  TIER: "阶梯档位",
  FORMULA: "自定义奖池",
  SHARE_POOL: "占比瓜分",
  RANK: "排名奖",
  PER_SUBMISSION: "单条稿件",
  ACTIVITY_THRESHOLD: "活动总数据",
  BASE_PLUS_STEP: "基础+步进",
};

const METRIC_LABEL: Record<RewardMetric, string> = {
  views: "播放量",
  likes: "点赞数",
  comments: "评论数",
  shares: "分享数",
  submissions: "条数",
};

const OP_DISPLAY: Record<FormulaOp, string> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
  "(": "(",
  ")": ")",
};

function emptyRule(kind: RewardRule["kind"]): RewardRule {
  switch (kind) {
    case "TIER":
      return { kind: "TIER", metric: "views", tiers: [{ min: 0, amount: 0 }] };
    case "FORMULA":
      return {
        kind: "FORMULA",
        tokens: [{ type: "metric", value: "views" }],
      };
    case "SHARE_POOL":
      return { kind: "SHARE_POOL", pool: 0, weightField: "views" };
    case "RANK":
      return {
        kind: "RANK",
        metric: "views",
        ranks: [{ from: 1, to: 1, amount: 0 }],
      };
    case "PER_SUBMISSION":
      return { kind: "PER_SUBMISSION", amount: 0 };
    case "ACTIVITY_THRESHOLD":
      return {
        kind: "ACTIVITY_THRESHOLD",
        metric: "views",
        threshold: 0,
        amount: 0,
      };
    case "BASE_PLUS_STEP":
      return {
        kind: "BASE_PLUS_STEP",
        metric: "views",
        baseThreshold: 0,
        baseAmount: 0,
        stepStart: 0,
        stepSize: 1000,
        stepAmount: 0,
      };
  }
}

export default function RewardRulesEditor({
  value,
  onChange,
}: {
  value: RewardRule[];
  onChange: (next: RewardRule[]) => void;
}) {
  function update(i: number, rule: RewardRule) {
    const next = value.slice();
    next[i] = rule;
    onChange(next);
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function add(kind: RewardRule["kind"]) {
    onChange([...value, emptyRule(kind)]);
  }

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <Card className="border-dashed p-6 text-center text-sm text-muted-foreground">
          暂未配置激励规则。可以叠加多条不同类型的规则。
        </Card>
      ) : (
        value.map((rule, i) => (
          <Card key={i} className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  规则 #{i + 1}
                </span>
                <Select
                  value={rule.kind}
                  onValueChange={(v) =>
                    update(i, emptyRule(v as RewardRule["kind"]))
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_LABEL) as RewardRule["kind"][]).map(
                      (k) => (
                        <SelectItem key={k} value={k}>
                          {KIND_LABEL[k]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => remove(i)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
                删除
              </Button>
            </div>

            {rule.kind === "TIER" && (
              <TierEditor rule={rule} onChange={(r) => update(i, r)} />
            )}
            {rule.kind === "FORMULA" && (
              <FormulaEditor rule={rule} onChange={(r) => update(i, r)} />
            )}
            {rule.kind === "SHARE_POOL" && (
              <SharePoolEditor rule={rule} onChange={(r) => update(i, r)} />
            )}
            {rule.kind === "RANK" && (
              <RankEditor rule={rule} onChange={(r) => update(i, r)} />
            )}
            {rule.kind === "PER_SUBMISSION" && (
              <PerSubmissionEditor
                rule={rule}
                onChange={(r) => update(i, r)}
              />
            )}
            {rule.kind === "ACTIVITY_THRESHOLD" && (
              <ActivityThresholdEditor
                rule={rule}
                onChange={(r) => update(i, r)}
              />
            )}
            {rule.kind === "BASE_PLUS_STEP" && (
              <BasePlusStepEditor
                rule={rule}
                onChange={(r) => update(i, r)}
              />
            )}

            <CapField
              cap={rule.cap}
              onChange={(cap) => update(i, { ...rule, cap } as RewardRule)}
            />
            <CpmCapField
              cpmCap={rule.cpmCap}
              onChange={(cpmCap) =>
                update(i, { ...rule, cpmCap } as RewardRule)
              }
            />
          </Card>
        ))
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">添加规则:</span>
        {(Object.keys(KIND_LABEL) as RewardRule["kind"][]).map((k) => (
          <Button
            key={k}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => add(k)}
            disabled={value.length >= 10}
          >
            <Plus className="size-3.5" />
            {KIND_LABEL[k]}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ── 共用:激励上限 ──────────────────────────────────────
function CapField({
  cap,
  onChange,
}: {
  cap: number | undefined;
  onChange: (cap: number | undefined) => void;
}) {
  return (
    <div className="grid gap-2 border-t border-border pt-3 sm:grid-cols-[160px_1fr] sm:items-center">
      <Label className="text-xs">激励上限(元)</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          step="1"
          value={cap ?? ""}
          placeholder="不填 = 无上限"
          onChange={(e) =>
            onChange(
              e.target.value === "" ? undefined : Number(e.target.value),
            )
          }
          className="max-w-[220px]"
        />
        <span className="text-[11px] text-muted-foreground">
          引擎结算时取 min(计算值, 上限)
        </span>
      </div>
    </div>
  );
}

// ── 共用:CPM 上限(元/千播放) ─────────────────────────
// 实际换算到的金额上限 = cpmCap × 创作者播放量 / 1000;views=0 时不生效。
function CpmCapField({
  cpmCap,
  onChange,
}: {
  cpmCap: number | undefined;
  onChange: (cpmCap: number | undefined) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
      <Label className="text-xs">CPM 上限(元/千播放)</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          step="1"
          value={cpmCap ?? ""}
          placeholder="不填 = 无上限"
          onChange={(e) =>
            onChange(
              e.target.value === "" ? undefined : Number(e.target.value),
            )
          }
          className="max-w-[220px]"
        />
        <span className="text-[11px] text-muted-foreground">
          换算成金额 = CPM × 该创作者播放量 / 1000;views=0 不生效
        </span>
      </div>
    </div>
  );
}

// ── 共用:指标选择 ──────────────────────────────────────
function MetricSelect({
  value,
  onChange,
}: {
  value: RewardMetric;
  onChange: (v: RewardMetric) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as RewardMetric)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {METRICS.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── TIER ────────────────────────────────────────────────
function TierEditor({
  rule,
  onChange,
}: {
  rule: TierRule;
  onChange: (r: TierRule) => void;
}) {
  const setTier = (i: number, patch: Partial<TierRule["tiers"][number]>) =>
    onChange({
      ...rule,
      tiers: rule.tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)),
    });
  const addTier = () =>
    onChange({ ...rule, tiers: [...rule.tiers, { min: 0, amount: 0 }] });
  const removeTier = (i: number) =>
    onChange({ ...rule, tiers: rule.tiers.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-3 rounded-md bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
        <Label className="text-xs">指标维度</Label>
        <MetricSelect
          value={rule.metric}
          onChange={(v) => onChange({ ...rule, metric: v })}
        />
      </div>

      <div>
        <div className="mb-1.5 grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs text-muted-foreground">
          <span>区间下限(&gt;,严格大于)</span>
          <span>区间上限(≤,留空 = 不封顶)</span>
          <span>金额(元)</span>
          <span />
        </div>
        <div className="space-y-1.5">
          {rule.tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
              <Input
                type="number"
                min={0}
                value={t.min}
                onChange={(e) =>
                  setTier(i, { min: Number(e.target.value) || 0 })
                }
              />
              <Input
                type="number"
                min={0}
                value={t.max ?? ""}
                placeholder="不封顶"
                onChange={(e) =>
                  setTier(i, {
                    max:
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                  })
                }
              />
              <Input
                type="number"
                min={0}
                step="1"
                value={t.amount}
                onChange={(e) =>
                  setTier(i, { amount: Number(e.target.value) || 0 })
                }
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeTier(i)}
                disabled={rule.tiers.length <= 1}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addTier}
          disabled={rule.tiers.length >= 20}
          className="mt-2"
        >
          <Plus className="size-3.5" />
          增加一档
        </Button>
      </div>
    </div>
  );
}

// ── FORMULA(自定义奖池 · 积木式编排) ───────────────────
function compileTokens(tokens: FormulaToken[]): string {
  return tokens
    .map((t) => {
      if (t.type === "metric") return METRIC_LABEL[t.value];
      if (t.type === "op") return OP_DISPLAY[t.value];
      return String(t.value);
    })
    .join(" ");
}

function FormulaEditor({
  rule,
  onChange,
}: {
  rule: FormulaRule;
  onChange: (r: FormulaRule) => void;
}) {
  const [numInput, setNumInput] = useState("");

  const push = (tok: FormulaToken) =>
    onChange({ ...rule, tokens: [...rule.tokens, tok] });
  const removeAt = (i: number) =>
    onChange({ ...rule, tokens: rule.tokens.filter((_, idx) => idx !== i) });
  const clear = () => onChange({ ...rule, tokens: [] });
  const popLast = () =>
    onChange({ ...rule, tokens: rule.tokens.slice(0, -1) });

  function addNumber() {
    const n = Number(numInput);
    if (!Number.isFinite(n) || numInput.trim() === "") return;
    push({ type: "number", value: n });
    setNumInput("");
  }

  const preview = compileTokens(rule.tokens);

  return (
    <div className="space-y-3 rounded-md bg-muted/30 p-3">
      {/* 当前公式 — 积木条 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">奖池公式</Label>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={popLast}
              disabled={rule.tokens.length === 0}
              className="h-7 text-xs"
            >
              回退
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clear}
              disabled={rule.tokens.length === 0}
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
            >
              清空
            </Button>
          </div>
        </div>
        <div className="flex min-h-[3rem] flex-wrap items-center gap-1.5 rounded-md border border-input bg-background p-2">
          {rule.tokens.length === 0 ? (
            <span className="px-1 text-xs text-muted-foreground">
              点下面的积木拼公式;点已添加的积木可以删除
            </span>
          ) : (
            rule.tokens.map((t, i) => (
              <TokenChip
                key={i}
                token={t}
                onRemove={() => removeAt(i)}
              />
            ))
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          预览:
          <span className="ml-1 font-mono text-foreground">
            {preview || "—"}
          </span>
        </p>
      </div>

      {/* 三类积木选板 */}
      <BlockRow label="结算值">
        {METRICS.map((m) => (
          <BlockButton
            key={m.value}
            tone="metric"
            onClick={() => push({ type: "metric", value: m.value })}
          >
            {m.label}
          </BlockButton>
        ))}
      </BlockRow>

      <BlockRow label="运算符">
        {FORMULA_OPS.map((op) => (
          <BlockButton
            key={op}
            tone="op"
            onClick={() => push({ type: "op", value: op })}
          >
            {OP_DISPLAY[op]}
          </BlockButton>
        ))}
      </BlockRow>

      <BlockRow label="常数">
        <Input
          type="number"
          value={numInput}
          step="1"
          placeholder="输入数字"
          className="h-8 w-32"
          onChange={(e) => setNumInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addNumber();
            }
          }}
        />
        <BlockButton tone="number" onClick={addNumber}>
          <Plus className="size-3.5" />
          添加
        </BlockButton>
      </BlockRow>
    </div>
  );
}

function BlockRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[64px_1fr] sm:items-center">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

const TONE_CLS: Record<"metric" | "op" | "number", string> = {
  metric:
    "border-sky-300/60 bg-sky-100 text-sky-900 hover:bg-sky-200 dark:border-sky-700/60 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-900/60",
  op:
    "border-violet-300/60 bg-violet-100 text-violet-900 font-semibold hover:bg-violet-200 dark:border-violet-700/60 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-900/60",
  number:
    "border-amber-300/60 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/60",
};

function BlockButton({
  tone,
  onClick,
  children,
}: {
  tone: "metric" | "op" | "number";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs transition-colors",
        TONE_CLS[tone],
      )}
    >
      {children}
    </button>
  );
}

function TokenChip({
  token,
  onRemove,
}: {
  token: FormulaToken;
  onRemove: () => void;
}) {
  const tone = token.type === "metric" ? "metric" : token.type === "op" ? "op" : "number";
  const label =
    token.type === "metric"
      ? METRIC_LABEL[token.value]
      : token.type === "op"
        ? OP_DISPLAY[token.value]
        : String(token.value);
  return (
    <button
      type="button"
      onClick={onRemove}
      title="点击删除"
      className={cn(
        "group inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors",
        TONE_CLS[tone],
      )}
    >
      <span>{label}</span>
      <X className="size-3 opacity-50 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

// ── SHARE_POOL ──────────────────────────────────────────
function SharePoolEditor({
  rule,
  onChange,
}: {
  rule: SharePoolRule;
  onChange: (r: SharePoolRule) => void;
}) {
  return (
    <div className="grid gap-3 rounded-md bg-muted/30 p-3 sm:grid-cols-3">
      <div>
        <Label className="mb-1.5 block text-xs">奖池总额(元)</Label>
        <Input
          type="number"
          min={0}
          step="1"
          value={rule.pool}
          onChange={(e) =>
            onChange({ ...rule, pool: Number(e.target.value) || 0 })
          }
        />
      </div>
      <div>
        <Label className="mb-1.5 block text-xs">权重指标</Label>
        <MetricSelect
          value={rule.weightField}
          onChange={(v) => onChange({ ...rule, weightField: v })}
        />
      </div>
      <div>
        <Label className="mb-1.5 block text-xs">仅前 N 名(可选)</Label>
        <Input
          type="number"
          min={1}
          value={rule.topN ?? ""}
          placeholder="不填 = 全员参与"
          onChange={(e) =>
            onChange({
              ...rule,
              topN:
                e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
        />
      </div>
    </div>
  );
}

// ── RANK ────────────────────────────────────────────────
function RankEditor({
  rule,
  onChange,
}: {
  rule: RankRule;
  onChange: (r: RankRule) => void;
}) {
  const setRank = (i: number, patch: Partial<RankRule["ranks"][number]>) =>
    onChange({
      ...rule,
      ranks: rule.ranks.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    });
  const addRank = () => {
    const last = rule.ranks[rule.ranks.length - 1];
    const nextFrom = last ? last.to + 1 : 1;
    onChange({
      ...rule,
      ranks: [...rule.ranks, { from: nextFrom, to: nextFrom, amount: 0 }],
    });
  };
  const removeRank = (i: number) =>
    onChange({ ...rule, ranks: rule.ranks.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-3 rounded-md bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
        <Label className="text-xs">排名依据</Label>
        <MetricSelect
          value={rule.metric}
          onChange={(v) => onChange({ ...rule, metric: v })}
        />
      </div>

      <div>
        <div className="mb-1.5 grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs text-muted-foreground">
          <span>首位排名(≥1)</span>
          <span>末位排名(≥首位)</span>
          <span>金额(元)</span>
          <span />
        </div>
        <div className="space-y-1.5">
          {rule.ranks.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
              <Input
                type="number"
                min={1}
                value={r.from}
                onChange={(e) =>
                  setRank(i, { from: Math.max(1, Number(e.target.value) || 1) })
                }
              />
              <Input
                type="number"
                min={1}
                value={r.to}
                onChange={(e) =>
                  setRank(i, { to: Math.max(1, Number(e.target.value) || 1) })
                }
              />
              <Input
                type="number"
                min={0}
                step="1"
                value={r.amount}
                onChange={(e) =>
                  setRank(i, { amount: Number(e.target.value) || 0 })
                }
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeRank(i)}
                disabled={rule.ranks.length <= 1}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addRank}
          disabled={rule.ranks.length >= 20}
          className="mt-2"
        >
          <Plus className="size-3.5" />
          增加一档排名
        </Button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          例:1~1 给 500,2~3 各 200,4~10 各 50。
        </p>
      </div>
    </div>
  );
}

// ── PER_SUBMISSION ──────────────────────────────────────
function PerSubmissionEditor({
  rule,
  onChange,
}: {
  rule: PerSubmissionRule;
  onChange: (r: PerSubmissionRule) => void;
}) {
  return (
    <div className="space-y-3 rounded-md bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <Label className="mb-1.5 block text-xs">每条稿件金额(元)</Label>
          <Input
            type="number"
            min={0}
            step="1"
            value={rule.amount}
            onChange={(e) =>
              onChange({ ...rule, amount: Number(e.target.value) || 0 })
            }
            className="max-w-[220px]"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            单条稿件按此金额计;最终按下方「激励上限」截断。
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={rule.approvedOnly ?? false}
            onCheckedChange={(v) =>
              onChange({ ...rule, approvedOnly: v === true ? true : undefined })
            }
          />
          仅审核通过的稿件
        </label>
      </div>

      <div>
        <Label className="mb-1.5 block text-xs">最小播放量(可选,≥)</Label>
        <Input
          type="number"
          min={0}
          step={1}
          value={rule.minViews ?? ""}
          placeholder="不填 = 不限制"
          onChange={(e) =>
            onChange({
              ...rule,
              minViews:
                e.target.value === "" ? undefined : Number(e.target.value) || 0,
            })
          }
          className="max-w-[220px]"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          只数播放量达到此门槛的稿件;无播放数据的稿件视为 0,不计入。
        </p>
      </div>
    </div>
  );
}

// ── ACTIVITY_THRESHOLD ──────────────────────────────────
function ActivityThresholdEditor({
  rule,
  onChange,
}: {
  rule: ActivityThresholdRule;
  onChange: (r: ActivityThresholdRule) => void;
}) {
  return (
    <div className="space-y-3 rounded-md bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label className="mb-1.5 block text-xs">统计指标</Label>
          <MetricSelect
            value={rule.metric}
            onChange={(v) => onChange({ ...rule, metric: v })}
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">活动总数门槛</Label>
          <Input
            type="number"
            min={1}
            value={rule.threshold}
            onChange={(e) =>
              onChange({ ...rule, threshold: Number(e.target.value) || 0 })
            }
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">达标奖励(元)</Label>
          <Input
            type="number"
            min={0}
            step="1"
            value={rule.amount}
            onChange={(e) =>
              onChange({ ...rule, amount: Number(e.target.value) || 0 })
            }
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        例:全活动播放量达 1,000,000 时,整体加 500 元(由结算策略决定如何分发)。
      </p>
    </div>
  );
}

// ── BASE_PLUS_STEP ──────────────────────────────────────
function BasePlusStepEditor({
  rule,
  onChange,
}: {
  rule: BasePlusStepRule;
  onChange: (r: BasePlusStepRule) => void;
}) {
  return (
    <div className="space-y-3 rounded-md bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-center">
        <Label className="text-xs">指标维度</Label>
        <MetricSelect
          value={rule.metric}
          onChange={(v) => onChange({ ...rule, metric: v })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="mb-1.5 block text-xs">触发门槛(≥)</Label>
          <Input
            type="number"
            min={0}
            value={rule.baseThreshold}
            onChange={(e) =>
              onChange({
                ...rule,
                baseThreshold: Number(e.target.value) || 0,
              })
            }
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">达标固定奖(元)</Label>
          <Input
            type="number"
            min={0}
            step="1"
            value={rule.baseAmount}
            onChange={(e) =>
              onChange({ ...rule, baseAmount: Number(e.target.value) || 0 })
            }
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label className="mb-1.5 block text-xs">步进起点(超过该值起步进)</Label>
          <Input
            type="number"
            min={0}
            value={rule.stepStart}
            onChange={(e) =>
              onChange({ ...rule, stepStart: Number(e.target.value) || 0 })
            }
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">步长(每多少)</Label>
          <Input
            type="number"
            min={1}
            value={rule.stepSize}
            onChange={(e) =>
              onChange({
                ...rule,
                stepSize: Math.max(1, Number(e.target.value) || 1),
              })
            }
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">每步金额(元)</Label>
          <Input
            type="number"
            min={0}
            step="1"
            value={rule.stepAmount}
            onChange={(e) =>
              onChange({ ...rule, stepAmount: Number(e.target.value) || 0 })
            }
          />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        例:播放量 ≥ 200 给 5 元;超过 1000 后,每 1000 再加 7 元
        (起点 1000,步长 1000,每步 7)。
      </p>
    </div>
  );
}
