/**
 * 运营 / 管理员 · 采集任务 · 列表(Jenkins 风格的 Job 视图)
 *
 * 重构后(2026-06):/operator/tasks 不再展示平铺的 Task 列表。
 *   - 第 1 层:Job 列表(本页),每行 = 一个采集任务模板,显示绑定 Agent / cron 中文 / 最近运行状态 + 时间 / 总执行次数
 *   - 第 2 层:点 Job 名 → /operator/tasks/[jobId],触发表单 + 最近执行
 *   - 第 3 层:点单次执行 → /operator/tasks/[jobId]/runs/[runId],参数 / 耗时 / 折叠日志
 *
 * "新建 Job" 按钮仅 ADMIN 可见(改模板属于高危操作,不放开给运营)。
 * 想看跨 Job 的平铺历史,管理员可从 /operator/admin/jobs 进单 Job 看。
 */
import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { describeCron } from "@/lib/cron-describe";
import { isOffline } from "@/lib/agent-offline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import TaskStatusBadge from "./_components/TaskStatusBadge";

export default async function OperatorTasksPage({
  searchParams,
}: {
  searchParams?: { enabled?: string; q?: string };
}) {
  await requireRole("OPERATOR");
  const session = await getSession();
  const isAdmin = session?.role === "ADMIN";

  const enabledFilter =
    searchParams?.enabled === "true"
      ? true
      : searchParams?.enabled === "false"
        ? false
        : undefined;
  const q = searchParams?.q?.trim() || undefined;

  const where: Prisma.CrawlerJobWhereInput = {};
  if (enabledFilter !== undefined) where.enabled = enabledFilter;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const jobs = await prisma.crawlerJob.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      enabled: true,
      cronExpression: true,
      timeoutMinutes: true,
      createdAt: true,
      agent: { select: { id: true, name: true, status: true, lastSeenAt: true } },
      _count: { select: { tasks: true } },
      tasks: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          sequenceNumber: true,
          createdAt: true,
          finishedAt: true,
        },
      },
    },
  });

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">采集任务</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            每个采集任务对应一个 Job 模板。点击进去可触发新一次执行、查看历史与日志。
          </p>
        </div>
        {isAdmin && (
          <Button asChild>
            <Link href="/operator/admin/jobs/new">新建任务</Link>
          </Button>
        )}
      </header>

      {jobs.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          还没有采集任务。
          {isAdmin && (
            <>
              {" "}
              <Link href="/operator/admin/jobs/new" className="underline">
                新建一个
              </Link>{" "}
              试试。
            </>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[25%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
            </colgroup>
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr className="h-10">
                <th className="px-4 text-left font-medium">任务名 / 描述</th>
                <th className="px-4 text-center font-medium">总次数</th>
                <th className="px-4 text-center font-medium">爬虫机</th>
                <th className="px-4 text-center font-medium">启用</th>
                <th className="px-4 text-center font-medium">定时</th>
                <th className="px-4 text-center font-medium">最近执行</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((j) => {
                const last = j.tasks[0];
                const agentOffline = j.agent
                  ? isOffline(j.agent.lastSeenAt, j.agent.status)
                  : false;
                return (
                  <tr
                    key={j.id}
                    className="h-[72px] transition-colors hover:bg-muted/40"
                  >
                    <td className="px-4 align-middle">
                      <Link
                        href={`/operator/tasks/${j.id}`}
                        className="block truncate font-medium hover:text-primary"
                      >
                        {j.name}
                      </Link>
                      <div className="mt-1 line-clamp-1 min-h-[16px] text-[11px] text-muted-foreground">
                        {j.description || "—"}
                      </div>
                    </td>
                    <td className="px-4 text-center align-middle tabular-nums">
                      {j._count.tasks}
                    </td>
                    <td className="px-4 align-middle text-center text-xs">
                      {j.agent ? (
                        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                          <Link
                            href={`/operator/admin/agents/${j.agent.id}`}
                            className="truncate hover:text-primary"
                          >
                            {j.agent.name}
                          </Link>
                          {agentOffline && (
                            <Badge variant="destructive" className="text-[10px]">
                              离线
                            </Badge>
                          )}
                          {j.agent.status === "DISABLED" && (
                            <Badge variant="muted" className="text-[10px]">
                              停用
                            </Badge>
                          )}
                          {!agentOffline && j.agent.status === "ACTIVE" && (
                            <Badge variant="success" className="text-[10px]">
                              在线
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 text-center align-middle">
                      {j.enabled ? (
                        <Badge variant="success">启用</Badge>
                      ) : (
                        <Badge variant="muted">停用</Badge>
                      )}
                    </td>
                    <td className="px-4 align-middle text-center text-xs">
                      {j.cronExpression ? (
                        <div>
                          <div className="truncate">{describeCron(j.cronExpression)}</div>
                          <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                            {j.cronExpression}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">手动触发</span>
                      )}
                    </td>
                    <td className="px-4 align-middle text-center text-xs">
                      {last ? (
                        <div>
                          <div className="flex items-center justify-center gap-2">
                            <TaskStatusBadge status={last.status} />
                            <span className="font-mono text-[11px] text-muted-foreground">
                              #{last.sequenceNumber ?? "?"}
                            </span>
                          </div>
                          <div className="mt-1 truncate text-[10px] text-muted-foreground tabular-nums">
                            {fmtDateTime(last.finishedAt ?? last.createdAt)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">还未运行</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
