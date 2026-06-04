"use client";

/**
 * 活动详情页 · 激励结算区(阶段5)。
 *
 * 行为:
 *   - 挂载时拉一次 GET /api/operator/activities/:id/incentives,渲染 summary + 表格
 *   - 「重算预估」按钮 → POST /compute,然后重拉
 *   - 行展开看 breakdown(每条规则贡献多少)
 *   - 「调整」按钮 → 对话框输入 adjusted + reason;清空 adjusted 视为"撤销调整"
 *
 * 没配规则时整段灰显并禁用按钮。
 * 没有结算记录(还没算过)时显示"暂未计算,点重算预估生成"。
 */
import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreatorAvatar } from "@/components/creator-avatar";
import { fmtDateTime } from "@/lib/format";
import { REWARD_KIND_LABEL } from "@/lib/incentive/labels";

type Contribution = {
  ruleIndex: number;
  kind: string;
  raw: number;
  amount: number;
  cap: number | null;
  cpmCap: number | null;
  cpmLimit: number | null;
  cappedBy?: "cap" | "cpm";
  note?: string;
};

type IncentiveItem = {
  id: string;
  creatorId: string;
  nickname: string;
  username: string;
  avatarUrl: string | null;
  estimated: number;
  adjusted: number | null;
  adjustReason: string | null;
  adjustedBy: string | null;
  adjustedAt: string | null;
  breakdown: Contribution[];
  computedAt: string;
};

type Summary = {
  activityId: string;
  activityName: string;
  total: number;
  adjustedCount: number;
  totalEstimated: number;
  totalAdjusted: number;
  totalFinal: number;
  latestComputedAt: string | null;
};

function fmtMoney(n: number): string {
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtCount(n: number): string {
  return n.toLocaleString("zh-CN");
}

export default function IncentiveSection({
  activityId,
  hasRules,
}: {
  activityId: string;
  hasRules: boolean;
}) {
  const [items, setItems] = useState<IncentiveItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<IncentiveItem | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(
        `/api/operator/activities/${activityId}/incentives`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "加载失败");
        return;
      }
      setItems(data.items as IncentiveItem[]);
      setSummary(data.summary as Summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    load();
  }, [load]);

  async function compute() {
    if (!hasRules) return;
    setComputing(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/operator/activities/${activityId}/incentives/compute`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "计算失败");
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "计算失败");
    } finally {
      setComputing(false);
    }
  }

  return (
    <Card className="p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">激励结算</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasRules
              ? "按当前激励规则 + 已通过投稿数据预估每位创作者的金额。"
              : "未配置激励规则,先在上面表单里加规则。"}
            {summary?.latestComputedAt && (
              <span className="ml-2">
                · 最近计算 {fmtDateTime(new Date(summary.latestComputedAt))}
              </span>
            )}
          </p>
        </div>
        <Button
          size="sm"
          onClick={compute}
          disabled={!hasRules || computing}
        >
          {computing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          重算预估
        </Button>
      </header>

      {error && (
        <p className="mb-3 text-xs text-destructive">{error}</p>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat
          label="参与创作者"
          value={summary ? fmtCount(summary.total) : "—"}
        />
        <Stat
          label="预估总额(元)"
          value={summary ? fmtMoney(summary.totalEstimated) : "—"}
        />
        <Stat
          label={`已调整 ${summary?.adjustedCount ?? 0} 条(元)`}
          value={summary ? fmtMoney(summary.totalAdjusted) : "—"}
          tone="warn"
        />
        <Stat
          label="实发总额(元)"
          value={summary ? fmtMoney(summary.totalFinal) : "—"}
          tone="ok"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          正在加载激励数据
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {hasRules
            ? "暂无激励记录。点击右上「重算预估」根据当前规则生成。"
            : "请先在上方表单里至少添加一条激励规则,再来计算预估。"}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">创作者</th>
                <th className="px-3 py-2.5 font-medium text-right">预估(元)</th>
                <th className="px-3 py-2.5 font-medium text-right">调整(元)</th>
                <th className="px-3 py-2.5 font-medium text-right">实发(元)</th>
                <th className="px-3 py-2.5 font-medium">调整记录</th>
                <th className="px-3 py-2.5 font-medium text-right w-24">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((it) => {
                const isOpen = expanded === it.id;
                const final = it.adjusted ?? it.estimated;
                return (
                  <>
                    <tr key={it.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2.5 align-top">
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded(isOpen ? null : it.id)
                          }
                          className="flex items-center gap-2 text-left hover:text-primary"
                        >
                          {isOpen ? (
                            <ChevronDown className="size-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-3.5 text-muted-foreground" />
                          )}
                          <CreatorAvatar
                            avatar={it.avatarUrl}
                            name={it.nickname}
                            size="sm"
                          />
                          <div>
                            <div className="text-sm">{it.nickname}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {it.username}
                            </div>
                          </div>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 align-top text-right tabular-nums">
                        {fmtMoney(it.estimated)}
                      </td>
                      <td className="px-3 py-2.5 align-top text-right tabular-nums">
                        {it.adjusted == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-300">
                            {fmtMoney(it.adjusted)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top text-right font-medium tabular-nums">
                        {fmtMoney(final)}
                      </td>
                      <td className="px-3 py-2.5 align-top text-xs">
                        {it.adjusted == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div>
                            <div className="text-[11px] text-muted-foreground">
                              {it.adjustedBy ?? "—"}{" "}
                              {it.adjustedAt &&
                                `· ${fmtDateTime(new Date(it.adjustedAt))}`}
                            </div>
                            {it.adjustReason && (
                              <div className="mt-0.5 line-clamp-2 text-[11px]">
                                {it.adjustReason}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing(it)}
                        >
                          <Pencil className="size-3.5" />
                          调整
                        </Button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${it.id}_breakdown`} className="bg-muted/20">
                        <td colSpan={6} className="px-3 py-3">
                          <BreakdownView breakdown={it.breakdown} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdjustDialog
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          setItems((prev) =>
            prev.map((x) =>
              x.id === updated.id
                ? {
                    ...x,
                    adjusted: updated.adjusted,
                    adjustReason: updated.adjustReason,
                    adjustedAt: updated.adjustedAt,
                  }
                : x,
            ),
          );
          setEditing(null);
          // 调整后实发总额会变,顺手 reload summary
          load();
        }}
      />
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const toneCls =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-300"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-300"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-base font-semibold tabular-nums ${toneCls}`}>
        {value}
      </div>
    </div>
  );
}

function BreakdownView({ breakdown }: { breakdown: Contribution[] }) {
  if (!breakdown || breakdown.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        本创作者没有命中任何规则。
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-muted-foreground">明细</div>
      <ul className="space-y-1">
        {breakdown.map((c, i) => (
          <li
            key={i}
            className="flex flex-wrap items-center gap-2 text-xs"
          >
            <Badge variant="outline">#{c.ruleIndex + 1}</Badge>
            <span className="font-medium">
              {REWARD_KIND_LABEL[c.kind as keyof typeof REWARD_KIND_LABEL] ??
                c.kind}
            </span>
            {c.note && (
              <span className="text-muted-foreground">{c.note}</span>
            )}
            <span className="tabular-nums">
              +{fmtMoney(c.amount)}
            </span>
            {c.cappedBy && (
              <span className="text-[11px] text-amber-600 dark:text-amber-300">
                (原 {fmtMoney(c.raw)} ·{" "}
                {c.cappedBy === "cpm"
                  ? `CPM ${c.cpmCap}元/千播 截到 ${fmtMoney(c.amount)}`
                  : `金额上限截到 ${fmtMoney(c.amount)}`}
                )
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdjustDialog({
  item,
  onClose,
  onSaved,
}: {
  item: IncentiveItem | null;
  onClose: () => void;
  onSaved: (next: {
    id: string;
    adjusted: number | null;
    adjustReason: string | null;
    adjustedAt: string | null;
  }) => void;
}) {
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setAmount(item.adjusted == null ? "" : String(item.adjusted));
    setReason(item.adjustReason ?? "");
    setError(null);
  }, [item]);

  async function save(clear: boolean) {
    if (!item) return;
    setSaving(true);
    setError(null);
    try {
      const body: { adjusted: number | null; reason?: string } = clear
        ? { adjusted: null }
        : { adjusted: Number(amount), reason };
      if (!clear && (!Number.isFinite(body.adjusted!) || body.adjusted! < 0)) {
        setError("请输入合法的非负金额");
        setSaving(false);
        return;
      }
      const res = await fetch(`/api/operator/incentives/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "保存失败");
        return;
      }
      onSaved({
        id: item.id,
        adjusted: data.item.adjusted,
        adjustReason: data.item.adjustReason,
        adjustedAt: data.item.adjustedAt,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>人工调整激励</DialogTitle>
          <DialogDescription>
            {item && (
              <>
                {item.nickname} · 预估 {fmtMoney(item.estimated)} 元。
                调整后以此金额结算,清空则回到预估。
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="adj-amount" className="text-xs">
              调整后金额(元)
            </Label>
            <Input
              id="adj-amount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="留空 = 不锁定,沿用预估"
            />
          </div>
          <div>
            <Label htmlFor="adj-reason" className="text-xs">
              调整原因
            </Label>
            <Textarea
              id="adj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="可选,1000 字以内"
              rows={3}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          {item?.adjusted != null && (
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => save(true)}
              className="text-muted-foreground hover:text-destructive"
            >
              撤销调整
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={saving || amount === ""}
            onClick={() => save(false)}
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
