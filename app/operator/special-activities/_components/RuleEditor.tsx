"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { metricLabels, newRuleStep, numberFields, stepLabels, textFields, type NumberField, type RewardPool, type RuleCondition, type RuleStep } from "@/lib/special-activities/rules";

type Option<T extends string> = { value: T; label: string };
export function Choice<T extends string>({ label, value, options, onChange, placeholder }: {
  label: string; value: T | ""; options: readonly Option<T>[]; onChange: (value: T) => void; placeholder?: string;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={(next) => { const option = options.find((item) => item.value === next); if (option) onChange(option.value); }}>
        <SelectTrigger aria-label={label}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent position="item-aligned">
          <SelectGroup>{options.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function NumberInput({ label, value, onChange, min, step }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; step?: number;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input aria-label={label} type="number" min={min} step={step ?? 1} value={Number.isNaN(value) ? "" : value} onChange={(event) => onChange(event.target.valueAsNumber)} />
    </Field>
  );
}

const numericOptions = numberFields.map((value) => ({ value, label: metricLabels[value] }));
const conditionFields = [...numericOptions, ...textFields.map((value) => ({ value, label: metricLabels[value] }))];
const numericOperators = [
  { value: "gte", label: "大于等于" }, { value: "gt", label: "大于" }, { value: "lte", label: "小于等于" },
  { value: "lt", label: "小于" }, { value: "eq", label: "等于" },
] as const;
const textOperators = [{ value: "contains", label: "包含" }, { value: "notContains", label: "不包含" }, { value: "equals", label: "等于" }] as const;
export const matchOptions = [{ value: "ALL", label: "满足全部条件" }, { value: "ANY", label: "满足任一条件" }] as const;
const stepOptions = (Object.keys(stepLabels) as RuleStep["kind"][]).map((value) => ({ value, label: stepLabels[value] }));

function isTextCondition(condition: RuleCondition): condition is Extract<RuleCondition, { value: string }> {
  return typeof condition.value === "string";
}

function ConditionEditor({ condition, onChange, remove, index }: {
  condition: RuleCondition; onChange: (condition: RuleCondition) => void; remove?: () => void; index: number;
}) {
  return (
    <FieldGroup className="grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr_auto] sm:items-end">
      <Choice label={`条件 ${index + 1} 字段`} options={conditionFields} value={condition.field} onChange={(field) => {
        if (field === "title" || field === "platform" || field === "creatorUid") onChange({ field, op: "contains", value: "" });
        else onChange({ field, op: "gte", value: 0 });
      }} />
      {isTextCondition(condition) ? <>
        <Choice label="比较方式" options={textOperators} value={condition.op} onChange={(op) => onChange({ ...condition, op })} />
        <Field><FieldLabel>匹配文字</FieldLabel><Input aria-label="匹配文字" value={condition.value} onChange={(event) => onChange({ ...condition, value: event.target.value })} /></Field>
      </> : <>
        <Choice label="比较方式" options={numericOperators} value={condition.op} onChange={(op) => onChange({ ...condition, op })} />
        <NumberInput label="阈值" value={condition.value} onChange={(value) => onChange({ ...condition, value })} />
      </>}
      <Button type="button" variant="ghost" size="icon" aria-label={`删除条件 ${index + 1}`} disabled={!remove} onClick={remove}><Trash2 /></Button>
    </FieldGroup>
  );
}

function StepEditor({ step, change }: { step: RuleStep; change: (step: RuleStep) => void }) {
  if (step.kind === "GROUP") return <p className="text-sm text-muted-foreground">按平台和达人 UID 合并稿件。后续指标按达人累计，可使用稿件数和单稿最高推荐播放量。此前逐稿算出的奖励会合计。</p>;
  if (step.kind === "FILTER") return (
    <div className="flex flex-col gap-3">
      <div className="max-w-52"><Choice label="条件关系" options={matchOptions} value={step.match} onChange={(match) => change({ ...step, match })} /></div>
      {step.conditions.map((condition, index) => <ConditionEditor key={index} condition={condition} index={index}
        onChange={(value) => change({ ...step, conditions: step.conditions.map((item, i) => i === index ? value : item) })}
        remove={step.conditions.length > 1 ? () => change({ ...step, conditions: step.conditions.filter((_, i) => i !== index) }) : undefined} />)}
      <Button type="button" size="sm" variant="outline" className="self-start" disabled={step.conditions.length >= 12} onClick={() => change({ ...step, conditions: [...step.conditions, { field: "recommendedViews", op: "gte", value: 0 }] })}><Plus data-icon="inline-start" />添加条件</Button>
    </div>
  );
  if (step.kind === "FIXED" || step.kind === "CAP") return <div className="max-w-52"><NumberInput label={step.kind === "CAP" ? "金额上限（元）" : "计奖金额（元）"} min={0} step={0.01} value={step.amount} onChange={(amount) => change({ ...step, amount })} /></div>;

  const metric = <Choice<NumberField> label={step.kind === "LIMIT" || step.kind === "RANK" ? "按指标降序排列" : "计奖指标"} value={step.metric} options={numericOptions} onChange={(value) => change({ ...step, metric: value })} />;
  if (step.kind === "LIMIT") return (
    <FieldGroup className="grid gap-3 sm:grid-cols-3">
      {metric}
      <Choice label="限量范围" value={step.scope} options={[{ value: "AUTHOR", label: "每个达人" }, { value: "POOL", label: "整个奖池" }]} onChange={(scope) => change({ ...step, scope })} />
      <NumberInput label="保留项数" min={1} value={step.count} onChange={(count) => change({ ...step, count })} />
    </FieldGroup>
  );
  if (step.kind === "RATE") return (
    <FieldGroup className="grid gap-3 sm:grid-cols-3">
      {metric}
      <NumberInput label="每多少单位" min={1} value={step.unit} onChange={(unit) => change({ ...step, unit })} />
      <NumberInput label="对应金额（元）" min={0} step={0.01} value={step.amount} onChange={(amount) => change({ ...step, amount })} />
    </FieldGroup>
  );
  if (step.kind === "RANK") {
    const rankStep = step;
    function updateRange(index: number, patch: Partial<(typeof rankStep.ranges)[number]>) {
      change({ ...rankStep, ranges: rankStep.ranges.map((range, i) => i === index ? { ...range, ...patch } : range) });
    }
    const nextRank = Math.max(0, ...step.ranges.map((range) => range.to).filter((end) => Number.isInteger(end) && end < 50_000)) + 1;
    return (
      <div className="flex flex-col gap-3">
        <div className="max-w-52">{metric}</div>
        <p className="text-sm text-muted-foreground">对当前保留项排名，区间含首尾，区间外本步骤不计奖。同分时按固定顺序分配名次，达人按平台和 UID，稿件按 ID。</p>
        {step.ranges.map((range, index) => (
          <FieldGroup key={index} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
            <NumberInput label={`区间 ${index + 1} 开始名次`} min={1} value={range.from} onChange={(from) => updateRange(index, { from })} />
            <NumberInput label={`区间 ${index + 1} 结束名次`} min={1} value={range.to} onChange={(to) => updateRange(index, { to })} />
            <NumberInput label={`区间 ${index + 1} 每名金额（元）`} min={0} step={0.01} value={range.amount} onChange={(amount) => updateRange(index, { amount })} />
            <Button type="button" variant="ghost" size="icon" aria-label={`删除名次区间 ${index + 1}`} disabled={step.ranges.length === 1}
              onClick={() => change({ ...step, ranges: step.ranges.filter((_, i) => i !== index) })}><Trash2 /></Button>
          </FieldGroup>
        ))}
        <Button type="button" variant="outline" size="sm" className="self-start" disabled={step.ranges.length >= 40}
          onClick={() => change({ ...step, ranges: [...step.ranges, { from: nextRank, to: nextRank, amount: 0 }] })}>
          <Plus data-icon="inline-start" />添加名次区间
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-52">{metric}</div>
      <p className="text-sm text-muted-foreground">达到门槛即命中，同一步只按已达到的最高档计奖。</p>
      {step.tiers.map((tier, index) => (
        <FieldGroup key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
          <NumberInput label={`档位 ${index + 1} 门槛`} min={0} value={tier.min} onChange={(min) => change({ ...step, tiers: step.tiers.map((item, i) => i === index ? { ...item, min } : item) })} />
          <NumberInput label="金额（元）" min={0} step={0.01} value={tier.amount} onChange={(amount) => change({ ...step, tiers: step.tiers.map((item, i) => i === index ? { ...item, amount } : item) })} />
          <Button type="button" variant="ghost" size="icon" aria-label={`删除档位 ${index + 1}`} disabled={step.tiers.length === 1} onClick={() => change({ ...step, tiers: step.tiers.filter((_, i) => i !== index) })}><Trash2 /></Button>
        </FieldGroup>
      ))}
      <Button type="button" variant="outline" size="sm" className="self-start" disabled={step.tiers.length >= 40} onClick={() => change({ ...step, tiers: [...step.tiers, { min: 0, amount: 0 }] })}><Plus data-icon="inline-start" />添加档位</Button>
    </div>
  );
}

function move<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function RuleEditor({ pools, change }: { pools: RewardPool[]; change: (pools: RewardPool[]) => void }) {
  const [index, setIndex] = useState(0);
  const pool = pools[index];
  const groupName = pool?.exclusiveGroup.trim() ?? "";
  const groupMembers = groupName ? pools.filter((item) => item.exclusiveGroup.trim() === groupName) : [];
  const otherGroups = [...new Set(pools.map((item) => item.exclusiveGroup.trim()).filter(Boolean))]
    .filter((name) => name !== groupName)
    .map((name) => ({ value: name, label: name }));
  const update = (value: RewardPool) => change(pools.map((item, i) => i === index ? value : item));
  function add(copy?: RewardPool) {
    const name = copy ? `${copy.name.slice(0, 64)} 副本` : "新奖池";
    let unique = name;
    let suffix = 2;
    while (pools.some((item) => item.name === unique)) unique = `${name} ${suffix++}`;
    change([...pools, copy ? { ...structuredClone(copy), name: unique } : { name: unique, exclusiveGroup: "", steps: [] }]);
    setIndex(pools.length);
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">奖池优先顺序（从高到低）</p>
        {pools.map((item, i) => <Button key={i} type="button" variant={i === index ? "secondary" : "ghost"} className="justify-start" aria-pressed={i === index} onClick={() => setIndex(i)}><span className="shrink-0 tabular-nums">{i + 1}.</span><span className="truncate">{item.name || "未命名奖池"}</span></Button>)}
        <Button type="button" variant="outline" disabled={pools.length >= 12} onClick={() => add()}><Plus data-icon="inline-start" />新增奖池</Button>
      </div>
      {pool ? <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">奖池 {index + 1}</h3>
          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="ghost" size="sm" aria-label="提高奖池优先级" disabled={index === 0} onClick={() => { change(move(pools, index, index - 1)); setIndex(index - 1); }}><ArrowUp data-icon="inline-start" />提高优先级</Button>
            <Button type="button" variant="ghost" size="sm" aria-label="降低奖池优先级" disabled={index === pools.length - 1} onClick={() => { change(move(pools, index, index + 1)); setIndex(index + 1); }}><ArrowDown data-icon="inline-start" />降低优先级</Button>
            <Button type="button" variant="ghost" size="sm" disabled={pools.length >= 12} onClick={() => add(pool)}><Copy data-icon="inline-start" />复制</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { change(pools.filter((_, i) => i !== index)); setIndex(Math.max(0, index - 1)); }}><Trash2 data-icon="inline-start" />删除奖池</Button>
          </div>
        </div>
        <FieldGroup className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="pool-name">奖池名称</FieldLabel><Input id="pool-name" value={pool.name} maxLength={80} onChange={(e) => update({ ...pool, name: e.target.value })} /></Field>
          <Field>
            <FieldLabel htmlFor="pool-exclusive">互斥组名称</FieldLabel>
            <Input id="pool-exclusive" value={pool.exclusiveGroup} maxLength={40} placeholder="例如：基础奖励组，留空可叠加" onChange={(e) => update({ ...pool, exclusiveGroup: e.target.value })} />
            <FieldDescription>需要互斥的奖池都填写同一个组名。每位达人在同组内只领取一个奖池的奖励。</FieldDescription>
          </Field>
        </FieldGroup>
        {otherGroups.length > 0 && <div className="max-w-64">
          <Choice label="选用已有互斥组" value="" placeholder="选择一个已有分组" options={otherGroups}
            onChange={(exclusiveGroup) => update({ ...pool, exclusiveGroup })} />
        </div>}
        {groupName ? <div className="flex flex-col gap-1 text-sm" aria-live="polite">
          {groupMembers.length === 1 ? <p className="text-muted-foreground">「{groupName}」目前只有当前奖池。请将其他需要互斥的奖池也加入此组。</p>
            : <p>同组优先顺序：{groupMembers.map((item) => item.name || "未命名奖池").join(" → ")}</p>}
          <p className="text-xs text-muted-foreground">同一达人按以上顺序领取第一个算出正金额的奖池。高优先级算出 0 元时，继续判断下一奖池。使用「提高／降低优先级」调整顺序，保存后生效。</p>
        </div> : <p className="text-sm text-muted-foreground">当前奖池可与其他奖池叠加计奖。</p>}
        <p className="text-xs text-muted-foreground">计算步骤从上到下执行，多个计奖步骤的金额相加。</p>
        {pool.steps.map((step, i) => (
          <Card key={i} className="shadow-none">
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-medium">{i + 1}. {stepLabels[step.kind]}</h4>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`上移步骤 ${i + 1}`} disabled={i === 0} onClick={() => update({ ...pool, steps: move(pool.steps, i, i - 1) })}><ArrowUp /></Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`下移步骤 ${i + 1}`} disabled={i === pool.steps.length - 1} onClick={() => update({ ...pool, steps: move(pool.steps, i, i + 1) })}><ArrowDown /></Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`删除步骤 ${i + 1}`} onClick={() => update({ ...pool, steps: pool.steps.filter((_, n) => n !== i) })}><Trash2 /></Button>
                </div>
              </div>
              <StepEditor step={step} change={(value) => update({ ...pool, steps: pool.steps.map((item, n) => i === n ? value : item) })} />
            </CardContent>
          </Card>
        ))}
        {pool.steps.length < 20 && <div className="max-w-56"><Choice label="添加计算步骤" value="" placeholder="选择一步添加到末尾" options={stepOptions} onChange={(kind) => update({ ...pool, steps: [...pool.steps, newRuleStep(kind)] })} /></div>}
      </div> : <p className="self-center text-sm text-muted-foreground">先新增一个奖池，然后按需要添加筛选、汇总、计奖等步骤。</p>}
    </div>
  );
}
