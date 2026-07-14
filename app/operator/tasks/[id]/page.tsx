/**
 * Job 详情页(运营 / 管理员 通用入口)
 *
 * URL:/operator/tasks/[id]  —— 这里的 [id] 是 jobId(以前是 taskId,2026-06 重构后改语义)
 *
 * 三块:
 *   1. 头部:Job 名 / Agent / cron 中文 / 启用状态;"编辑模板" 按钮仅 ADMIN 显示
 *   2. 触发表单:按 paramSchema 渲染输入,"运行" 写 task,跑完跳 runs 详情
 *   3. 最近 20 次执行表:点 row → /operator/tasks/[jobId]/runs/[runId]
 */
import Link from "next/link";
import { ChevronLeft, Pencil } from "lucide-react";
import { notFound as nextNotFound } from "next/navigation";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

const RUNS_PER_PAGE = 10;

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { describeCron } from "@/lib/cron-describe";
import { isOffline } from "@/lib/agent-offline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import TaskStatusBadge from "../_components/TaskStatusBadge";
import JobTriggerSection from "./_components/JobTriggerSection";

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { page?: string };
}) {
  await requireRole("OPERATOR");
  const session = await getSession();
  const isAdmin = session?.role === "ADMIN";

  const job = await prisma.crawlerJob.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      description: true,
      active: true,
      enabled: true,
      repoType: true,
      repoUrl: true,
      repoBranch: true,
      workdir: true,
      command: true,
      cronExpression: true,
      timeoutMinutes: true,
      paramSchema: true,
      outputs: true,
      createdAt: true,
      agent: {
        select: { id: true, name: true, status: true, lastSeenAt: true },
      },
      _count: { select: { tasks: true } },
    },
  });
  if (!job) nextNotFound();

  // 分页:?page=1 起;非法值降级回 1;末页之后也降级
  const totalRuns = job._count.tasks;
  const totalPages = Math.max(1, Math.ceil(totalRuns / RUNS_PER_PAGE));
  const rawPage = parseInt(searchParams?.page ?? "1", 10);
  const page =
    Number.isFinite(rawPage) && rawPage > 0
      ? Math.min(rawPage, totalPages)
      : 1;
  const skip = (page - 1) * RUNS_PER_PAGE;

  const recentRuns = await prisma.crawlerTask.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "desc" },
    skip,
    take: RUNS_PER_PAGE,
    select: {
      id: true,
      sequenceNumber: true,
      status: true,
      trigger: true,
      priority: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      exitCode: true,
      createdBy: { select: { username: true } },
    },
  });

  const agentOffline = job.agent
    ? isOffline(job.agent.lastSeenAt, job.agent.status)
    : false;

  return (
    <div className="p-8">
      <div className="mb-4">
        <Link
          href="/operator/tasks"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          返回任务列表
        </Link>
      </div>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{job.name}</h1>
            {job.active ? (
              <Badge variant="success">启用</Badge>
            ) : (
              <Badge variant="muted">已停用</Badge>
            )}
            {job.cronExpression && (
              job.enabled ? (
                <Badge variant="success" className="text-[10px]">定时开</Badge>
              ) : (
                <Badge variant="muted" className="text-[10px]">定时关</Badge>
              )
            )}
          </div>
          {job.description && (
            <p className="mt-1 text-sm text-muted-foreground">{job.description}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-mono">{job.id}</span> · 创建于{" "}
            {fmtDateTime(job.createdAt)} · 已执行 {job._count.tasks} 次
          </p>
        </div>
        {isAdmin && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/operator/admin/jobs/${job.id}`}>
              <Pencil className="size-3.5" />
              编辑模板
            </Link>
          </Button>
        )}
      </header>

      <div className="mb-6 grid items-stretch gap-4 lg:grid-cols-3">
        {/*
          运行配置卡:用 flex-col 让自身和右侧"立即触发"卡同高(items-stretch),
          内部各 KV 行用 flex-1 + justify-around 均匀分布;min-h-[300px] 保底,
          字段少时也不会被压扁。
        */}
        <Card className="flex min-h-[300px] flex-col p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium">运行配置</h2>
          <div className="flex flex-1 flex-col justify-around gap-3">
            <KV label="爬虫机">
              {job.agent ? (
                <Link
                  href={`/operator/admin/agents/${job.agent.id}`}
                  className="hover:text-primary"
                >
                  {job.agent.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">未绑定</span>
              )}
              {agentOffline && (
                <Badge variant="destructive" className="ml-2 text-[10px]">
                  离线
                </Badge>
              )}
            </KV>
            <KV label="仓库">
              <span className="font-mono text-[11px]">
                {job.repoType} · {job.repoUrl}
                {job.repoBranch && ` (${job.repoBranch})`}
              </span>
            </KV>
            <KV label="工作目录">
              <span className="font-mono text-[11px]">{job.workdir}</span>
            </KV>
            <KV label="命令">
              <code className="block whitespace-pre-wrap break-all rounded bg-muted/40 p-2 text-[11px]">
                {job.command}
              </code>
            </KV>
            <KV label="超时">{job.timeoutMinutes} 分钟</KV>
            <KV label="定时">
              {job.cronExpression ? (
                <span>
                  {describeCron(job.cronExpression)}{" "}
                  <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                    ({job.cronExpression})
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">仅手动触发</span>
              )}
            </KV>
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-medium">立即触发</h2>
          {!job.agent || job.agent.status !== "ACTIVE" ? (
            <p className="text-xs text-destructive">
              绑定的爬虫机不可用,任务会卡在 PENDING。先恢复爬虫机再触发。
            </p>
          ) : !job.active ? (
            <p className="text-xs text-destructive">
              任务已停用,不能触发。请先在采集任务列表点「启用」。
            </p>
          ) : (
            <>
              {job.cronExpression && !job.enabled && (
                <p className="rounded-md border border-amber-300/40 bg-amber-50/60 px-2 py-1 text-[11px] text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300">
                  定时已关,cron 不会自动触发,但可在此手动运行。
                </p>
              )}
              <JobTriggerSection
                jobId={job.id}
                paramSchema={
                  Array.isArray(job.paramSchema)
                    ? (job.paramSchema as Array<{
                        name: string;
                        label?: string;
                        type: "DATE" | "STRING" | "NUMBER" | "ENUM";
                        required?: boolean;
                        default?: string | number;
                        options?: string[];
                      }>)
                    : []
                }
              />
            </>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
          <span className="text-sm font-medium">
            最近执行(共 {totalRuns} 条)
          </span>
          {totalPages > 1 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              第 {page} / {totalPages} 页 · 本页 {recentRuns.length}
            </span>
          )}
        </div>
        {recentRuns.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            还未运行。
          </div>
        ) : (
          <table className="w-full table-fixed text-sm">
            <colgroup>
              {/* 7 列均分,每列 ~14.28% */}
              <col className="w-[14.28%]" />
              <col className="w-[14.28%]" />
              <col className="w-[14.28%]" />
              <col className="w-[14.28%]" />
              <col className="w-[14.28%]" />
              <col className="w-[14.28%]" />
              <col className="w-[14.28%]" />
            </colgroup>
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr className="h-10">
                <th className="px-3 text-center font-medium">任务编号</th>
                <th className="px-3 text-center font-medium">状态</th>
                <th className="px-3 text-center font-medium">触发</th>
                <th className="px-3 text-center font-medium">启动人</th>
                <th className="px-3 text-center font-medium">耗时</th>
                <th className="px-3 text-center font-medium">开始 / 结束</th>
                <th className="px-3 text-center font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentRuns.map((r) => {
                const duration = computeDuration(r.startedAt, r.finishedAt);
                return (
                  <tr
                    key={r.id}
                    className="h-[72px] transition-colors hover:bg-muted/40"
                  >
                    <td className="px-3 text-center align-middle font-mono text-xs tabular-nums">
                      <Link
                        href={`/operator/tasks/${job.id}/runs/${r.id}`}
                        className="hover:text-primary"
                      >
                        #{r.sequenceNumber ?? "?"}
                      </Link>
                    </td>
                    <td className="px-3 text-center align-middle">
                      <div className="flex justify-center">
                        <TaskStatusBadge status={r.status} />
                      </div>
                    </td>
                    <td className="px-3 text-center align-middle text-xs">
                      <div className="flex justify-center">
                        {r.trigger === "AUTO" ? (
                          <Badge variant="outline">自动</Badge>
                        ) : (
                          <Badge variant="secondary">手动</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 text-center align-middle text-xs">
                      {r.createdBy?.username ?? (
                        <span className="text-muted-foreground">系统</span>
                      )}
                    </td>
                    <td className="px-3 text-center align-middle text-xs tabular-nums">
                      {duration ?? "—"}
                    </td>
                    <td className="px-3 text-center align-middle text-[11px] text-muted-foreground tabular-nums">
                      <div>建 {fmtDateTime(r.createdAt)}</div>
                      {r.startedAt && <div>始 {fmtDateTime(r.startedAt)}</div>}
                      {r.finishedAt && <div>毕 {fmtDateTime(r.finishedAt)}</div>}
                    </td>
                    <td className="px-3 text-center align-middle">
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/operator/tasks/${job.id}/runs/${r.id}`}>
                          详情
                        </Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="border-t border-border px-4 py-3">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href={
                      page > 1
                        ? `/operator/tasks/${job.id}?page=${page - 1}`
                        : undefined
                    }
                    aria-disabled={page <= 1}
                    tabIndex={page <= 1 ? -1 : undefined}
                    className={
                      page <= 1
                        ? "pointer-events-none opacity-50"
                        : undefined
                    }
                  />
                </PaginationItem>
                {buildPageItems(page, totalPages).map((it, i) =>
                  it === "..." ? (
                    <PaginationItem key={`d-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={it}>
                      <PaginationLink
                        href={`/operator/tasks/${job.id}?page=${it}`}
                        isActive={it === page}
                      >
                        {it}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    href={
                      page < totalPages
                        ? `/operator/tasks/${job.id}?page=${page + 1}`
                        : undefined
                    }
                    aria-disabled={page >= totalPages}
                    tabIndex={page >= totalPages ? -1 : undefined}
                    className={
                      page >= totalPages
                        ? "pointer-events-none opacity-50"
                        : undefined
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </Card>
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

function computeDuration(start: Date | null, end: Date | null): string | null {
  if (!start) return null;
  const e = end ?? new Date();
  const ms = e.getTime() - start.getTime();
  if (ms < 0) return null;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3600_000)}h ${Math.floor((ms % 3600_000) / 60_000)}m`;
}

/**
 * 紧凑型页码序列(供 shadcn Pagination 渲染):
 *  - 总页数 ≤ 7 → 全部展开
 *  - 总页数 > 7 → 首页 / 当前 ±1 / 末页 + 省略号(...)
 */
function buildPageItems(current: number, total: number): Array<number | "..."> {
  const items: Array<number | "..."> = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) items.push(i);
    return items;
  }
  const set = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = Array.from(set)
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    items.push(sorted[i]);
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) {
      items.push("...");
    }
  }
  return items;
}
