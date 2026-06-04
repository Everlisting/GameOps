/**
 * 管理员 · 爬虫 Job 列表
 *
 * Job 是任务的"模板"(Jenkins 风格),绑定一台爬虫机 + 命令模板 + 参数 schema + 可选 cron。
 * 真正的执行是 CrawlerTask(由 /jobs/[id]/trigger 或 cron 自动建)。
 *
 * UI 风格对齐 /operator/tasks:table-fixed + 固定行高 + 第一列左对齐其余居中。
 */
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { Plus, Workflow } from "lucide-react";

import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { describeCron } from "@/lib/cron-describe";
import { isOffline } from "@/lib/agent-offline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams?: { agentId?: string; enabled?: string; q?: string };
}) {
  const where: Prisma.CrawlerJobWhereInput = {};
  if (searchParams?.agentId) where.agentId = searchParams.agentId;
  if (searchParams?.enabled === "true") where.enabled = true;
  if (searchParams?.enabled === "false") where.enabled = false;
  const q = searchParams?.q?.trim() ?? "";
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const items = await prisma.crawlerJob.findMany({
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
      agent: {
        select: { id: true, name: true, status: true, lastSeenAt: true },
      },
      _count: { select: { tasks: true } },
    },
  });

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">爬虫 Job</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Job = 任务模板:绑定一台爬虫机 + 命令模板 + 参数 + 可选 cron。每次"执行"是一条采集任务。
          </p>
        </div>
        <Button asChild>
          <Link href="/operator/admin/jobs/new">
            <Plus className="size-4" />
            新建 Job
          </Link>
        </Button>
      </header>

      <Card className="mb-5 p-4">
        <p className="text-xs text-muted-foreground">共 {items.length} 个 Job</p>
      </Card>

      {items.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          <Workflow className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3">还没有 Job,点右上「新建 Job」开始。</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[15%]" />
              <col className="w-[10%]" />
              <col className="w-[17%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr className="h-10">
                <th className="px-4 text-left font-medium">名称 / 描述</th>
                <th className="px-4 text-center font-medium">绑定机器</th>
                <th className="px-4 text-center font-medium">状态</th>
                <th className="px-4 text-center font-medium">Cron</th>
                <th className="px-4 text-center font-medium">超时</th>
                <th className="px-4 text-center font-medium">执行次数</th>
                <th className="px-4 text-center font-medium">创建时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((j) => {
                const agentOffline = isOffline(
                  j.agent.lastSeenAt,
                  j.agent.status,
                );
                return (
                  <tr
                    key={j.id}
                    className="h-[72px] transition-colors hover:bg-muted/40"
                  >
                    <td className="px-4 align-middle">
                      <Link
                        href={`/operator/admin/jobs/${j.id}`}
                        className="block truncate font-medium hover:text-primary"
                      >
                        {j.name}
                      </Link>
                      <div className="mt-1 line-clamp-1 min-h-[16px] text-[11px] text-muted-foreground">
                        {j.description || "—"}
                      </div>
                    </td>
                    <td className="px-4 align-middle text-center text-xs">
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
                          <div className="truncate">
                            {describeCron(j.cronExpression)}
                          </div>
                          <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                            {j.cronExpression}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">手动触发</span>
                      )}
                    </td>
                    <td className="px-4 text-center align-middle text-xs tabular-nums">
                      {j.timeoutMinutes} 分钟
                    </td>
                    <td className="px-4 text-center align-middle tabular-nums">
                      {j._count.tasks}
                    </td>
                    <td className="px-4 text-center align-middle text-xs text-muted-foreground tabular-nums">
                      {fmtDateTime(j.createdAt)}
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
