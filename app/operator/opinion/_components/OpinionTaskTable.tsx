"use client";

/**
 * 舆情监控 · 报告任务列表(client component,自带 5s 轮询状态)。
 *
 * 数据来源:GET /api/opinion/tasks?scope=X&status=Y
 * 交互:
 *   - 每 5s 拉一次列表,自动更新 PENDING / RUNNING 的状态徽章
 *   - status=DONE 显示"查看报告"按钮,新页面跳 /operator/opinion/reports/[id]/view
 *   - status=FAILED 显示"错误"按钮,点开看完整 errorMessage
 *   - ADMIN 有 "重跑" / "删除" 按钮
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { OpinionStatusBadge } from "./OpinionStatusBadge";
import { OpinionActions } from "./OpinionActions";
import { OpinionErrorDialog } from "./OpinionErrorDialog";

const POLL_MS = 5_000;

export interface OpinionTaskItem {
  task_id: string;
  scope: "private" | "public" | "combined";
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  game: string;
  coverage_span: string | null;
  created_by: string;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  duration_ms: number | null;
  error_message: string | null;
  parent_private?: string | null;
  parent_public?: string | null;
  llm_provider?: string | null;
  llm_model?: string | null;
  has_html: boolean;
  has_json: boolean;
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtDuration(ms: number | null): string {
  if (!ms || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export default function OpinionTaskTable({
  scope,
  initialItems,
  total,
  page,
  pageSize,
  isAdmin,
}: {
  scope: "private" | "public" | "combined";
  initialItems: OpinionTaskItem[];
  total: number;
  page: number;
  pageSize: number;
  isAdmin: boolean;
}) {
  const [items, setItems] = useState<OpinionTaskItem[]>(initialItems);
  const [errorItem, setErrorItem] = useState<OpinionTaskItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 当前页在总集中的偏移;用来轮询期间只刷本页数据,不会漏页也不会窜页
  const offset = (page - 1) * pageSize;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/opinion/tasks?scope=${scope}&limit=${pageSize}&offset=${offset}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setFetchError(b?.error?.message ?? `刷新失败(${res.status})`);
        return;
      }
      const body = (await res.json()) as { items: OpinionTaskItem[] };
      setItems(body.items);
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setRefreshing(false);
    }
  }, [scope, pageSize, offset]);

  // 若还有未终态项,每 5s 拉一次;全部终态则停轮询
  const hasInflight = useMemo(
    () => items.some((i) => i.status === "PENDING" || i.status === "RUNNING"),
    [items],
  );

  useEffect(() => {
    if (!hasInflight) return;
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [hasInflight, refresh]);

  if (items.length === 0) {
    return (
      <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
        暂无报告。{isAdmin ? "点右上角「生成新报告」创建。" : "等待管理员生成报告。"}
      </Card>
    );
  }

  return (
    <>
      {fetchError && (
        <div className="mb-3 rounded-md border border-amber-400/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {fetchError} · 下一轮会自动重试
        </div>
      )}
      <Card className="overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[13%]" />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr className="h-10">
              <th className="px-4 text-left font-medium">状态</th>
              <th className="px-4 text-left font-medium">创建时间</th>
              <th className="px-4 text-left font-medium">游戏 / 周期</th>
              <th className="px-4 text-left font-medium">操作人</th>
              <th className="px-4 text-left font-medium">耗时</th>
              <th className="px-4 text-left font-medium">模型</th>
              <th className="px-4 text-left font-medium">taskId</th>
              <th className="px-4 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((t) => (
              <tr key={t.task_id} className="h-12 transition-colors hover:bg-muted/40">
                <td className="px-4 align-middle">
                  <OpinionStatusBadge status={t.status} />
                </td>
                <td className="px-4 align-middle font-mono text-xs tabular-nums text-muted-foreground">
                  {fmtTime(t.created_at)}
                </td>
                <td className="px-4 align-middle">
                  <div className="truncate">{t.game}</div>
                  {t.coverage_span && (
                    <div className="truncate text-[10px] text-muted-foreground">
                      {t.coverage_span}
                    </div>
                  )}
                </td>
                <td className="px-4 align-middle text-xs">{t.created_by}</td>
                <td className="px-4 align-middle font-mono text-xs tabular-nums text-muted-foreground">
                  {fmtDuration(t.duration_ms)}
                </td>
                <td className="px-4 align-middle text-xs text-muted-foreground">
                  <span className="truncate">{t.llm_model || "—"}</span>
                </td>
                <td className="px-4 align-middle font-mono text-[11px] text-muted-foreground">
                  <span className="block truncate">{t.task_id}</span>
                </td>
                <td className="px-4 align-middle">
                  <div className="flex items-center justify-end gap-1.5">
                    {t.status === "DONE" && t.has_html && (
                      <Button asChild size="sm" variant="outline">
                        <a
                          href={`/operator/opinion/reports/${t.task_id}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          查看报告
                        </a>
                      </Button>
                    )}
                    {t.status === "FAILED" && t.error_message && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setErrorItem(t)}
                      >
                        错误详情
                      </Button>
                    )}
                    {isAdmin && (
                      <OpinionActions
                        taskId={t.task_id}
                        status={t.status}
                        onChanged={() => void refresh()}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          本页 {items.length} 条 · 共 {total} 条 ·{" "}
          {hasInflight ? "自动刷新中" : "已全部完成"}
          {refreshing && " · 正在刷新…"}
        </div>
      </Card>

      <OpinionErrorDialog
        item={errorItem}
        onClose={() => setErrorItem(null)}
      />
    </>
  );
}
