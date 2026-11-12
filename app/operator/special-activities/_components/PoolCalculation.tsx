import { metricLabels, stepLabels, type RewardPool, type RuleCondition, type RuleStep } from "@/lib/special-activities/rules";
import type { RewardResult } from "@/lib/special-activities/engine";

const money = (value: number) => `¥${value.toFixed(2)}`;
const operators = { gte: "≥", gt: ">", lte: "≤", lt: "<", eq: "=", contains: "包含", notContains: "不包含", equals: "等于" };

function conditionText(condition: RuleCondition) {
  return `${metricLabels[condition.field]} ${operators[condition.op]} ${condition.value}`;
}

function StepConfiguration({ step, grouped }: { step: RuleStep; grouped: boolean }) {
  switch (step.kind) {
    case "FILTER":
      return <p>{step.conditions.map(conditionText).join(step.match === "ALL" ? "，并且 " : "，或者 ")}</p>;
    case "GROUP":
      return <p>将同一平台、同一达人 UID 的稿件合并，累计播放量、稿件数和此前计算的奖励。</p>;
    case "LIMIT":
      return <p>按{metricLabels[step.metric]}从高到低排列，{step.scope === "AUTHOR" ? "每位达人" : "整个奖池"}保留前 {step.count} {grouped ? "位达人" : "条稿件"}。</p>;
    case "FIXED":
      return <p>给当前每{grouped ? "位达人" : "条稿件"}增加 {money(step.amount)} 奖励。</p>;
    case "TIER":
      return <>
        <p>按{metricLabels[step.metric]}命中的最高档计奖，门槛包含等号。</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {[...step.tiers].sort((a, b) => a.min - b.min).map((tier) => <li key={tier.min}>≥ {tier.min.toLocaleString()} → {money(tier.amount)}</li>)}
        </ul>
      </>;
    case "RANK":
      return <>
        <p>按{metricLabels[step.metric]}从高到低排名，根据名次增加奖励。</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {[...step.ranges].sort((a, b) => a.from - b.from).map((range) => <li key={range.from}>
            第 {range.from}{range.from !== range.to && `–${range.to}`} 名 → 每名 {money(range.amount)}
          </li>)}
        </ul>
      </>;
    case "RATE":
      return <p>{metricLabels[step.metric]}每 {step.unit.toLocaleString()} 单位增加 {money(step.amount)}，按实际比例计算并四舍五入到分。</p>;
    case "CAP":
      return <p>当前每{grouped ? "位达人" : "条稿件"}的累计奖励最高为 {money(step.amount)}。</p>;
  }
}

export default function PoolCalculation({ pool, outcome, index, frozen }: {
  pool: RewardPool;
  outcome: RewardResult["pools"][number];
  index: number;
  frozen: boolean;
}) {
  const winners = outcome.recipients.filter((row) => row.paidCents > 0);
  const total = winners.reduce((sum, row) => sum + row.paidCents, 0);
  const suppressed = outcome.recipients.filter((row) => row.suppressed).length;
  let grouped = false;
  const steps = pool.steps.map((step, stepIndex) => {
    if (step.kind === "GROUP") grouped = true;
    return { step, count: outcome.stepCounts[stepIndex], grouped, unit: grouped ? "位达人" : "条稿件" };
  });

  return (
    <details className="rounded-xl border border-border bg-card p-4 text-sm">
      <summary className="cursor-pointer">
        <span className="ml-1 font-medium">{index + 1}. {pool.name}</span>
        <span className="ml-3 inline-block text-muted-foreground">
          {frozen ? "获奖" : "预计获奖"} {winners.length.toLocaleString()} 人 · {money(total / 100)}
        </span>
      </summary>
      <div className="mt-4 flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">以下展示本奖池按顺序执行的规则及每步处理后的数量。获奖人数以最终奖励金额大于零的达人数统计。</p>
        {pool.exclusiveGroup && <p className="text-xs text-muted-foreground">
          互斥组「{pool.exclusiveGroup}」，按活动配置的奖池优先级计奖。
          {suppressed > 0 && `其中 ${suppressed} 位达人由更高优先级奖池计奖。`}
        </p>}
        <ol className="flex flex-col gap-3">
          {steps.map(({ step, count, unit, grouped }, stepIndex) => (
            <li key={stepIndex} className="flex flex-col gap-1 border-t border-border pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-medium">{stepIndex + 1}. {stepLabels[step.kind]}</h4>
                <span className="text-xs text-muted-foreground">
                  {count === undefined ? "暂无步骤数据" : `处理后 ${count.toLocaleString()} ${unit}`}
                </span>
              </div>
              <div className="flex flex-col gap-1 text-xs leading-relaxed text-muted-foreground"><StepConfiguration step={step} grouped={grouped} /></div>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
