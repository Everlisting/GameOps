/**
 * 管理员 · 爬虫机管理 · 列表
 * 仅 ADMIN 可见(布局已校验)。
 * 过滤:?status=ACTIVE|DISABLED / ?q=
 *
 * 重构后:删 capabilities 显示;ACTIVE 但 10min 无心跳标 OFFLINE 红色高亮。
 */
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { Plus, Server } from "lucide-react";

import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { isOffline } from "@/lib/agent-offline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STATUS_VALUES = ["ACTIVE", "DISABLED"] as const;

const STATUS_LABEL: Record<(typeof STATUS_VALUES)[number], string> = {
  ACTIVE: "启用",
  DISABLED: "停用",
};

export default async function AdminAgentsPage({
  searchParams,
}: {
  searchParams?: { status?: string; q?: string };
}) {
  const status = STATUS_VALUES.includes(
    searchParams?.status as (typeof STATUS_VALUES)[number],
  )
    ? (searchParams!.status as (typeof STATUS_VALUES)[number])
    : undefined;
  const q = searchParams?.q?.trim() ?? "";

  const where: Prisma.CrawlerAgentWhereInput = {};
  if (status) where.status = status;
  if (q) where.name = { contains: q, mode: "insensitive" };

  const items = await prisma.crawlerAgent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      lastSeenAt: true,
      lastSeenIp: true,
      createdAt: true,
      createdBy: { select: { username: true } },
      _count: { select: { tasks: true, jobs: true } },
    },
  });

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">爬虫机管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            维护爬虫机器、生成 / 重置 token。任务通过 Job 显式绑定到机器执行。
          </p>
        </div>
        <Button asChild>
          <Link href="/operator/admin/agents/new">
            <Plus className="size-4" />
            新建机器
          </Link>
        </Button>
      </header>

      <Card className="mb-5 p-4">
        <p className="text-xs text-muted-foreground">
          共 {items.length} 台{status ? `(仅 ${STATUS_LABEL[status]})` : ""}
        </p>
      </Card>

      {items.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          <Server className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3">还没有爬虫机器,点右上「新建机器」开始。</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">名称</th>
                <th className="px-3 py-2.5 font-medium">状态</th>
                <th className="px-3 py-2.5 font-medium">最近心跳</th>
                <th className="px-3 py-2.5 font-medium text-right">绑定 Job</th>
                <th className="px-3 py-2.5 font-medium text-right">历史任务</th>
                <th className="px-3 py-2.5 font-medium">创建</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((a) => {
                const offline = isOffline(a.lastSeenAt, a.status);
                return (
                  <tr
                    key={a.id}
                    className={cn(
                      "transition-colors hover:bg-muted/40",
                      offline && "bg-destructive/5 hover:bg-destructive/10",
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/operator/admin/agents/${a.id}`}
                        className="font-medium hover:text-primary"
                      >
                        {a.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      {a.status === "ACTIVE" ? (
                        offline ? (
                          <Badge variant="destructive">离线</Badge>
                        ) : (
                          <Badge variant="success">在线</Badge>
                        )
                      ) : (
                        <Badge variant="muted">停用</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs">
                      {a.lastSeenAt ? (
                        <div>
                          <div className={cn(offline && "text-destructive font-medium")}>
                            {fmtDateTime(a.lastSeenAt)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {a.lastSeenIp ?? "未知 IP"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-destructive">从未上报</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right tabular-nums">
                      {a._count.jobs}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right tabular-nums">
                      {a._count.tasks}
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-muted-foreground">
                      <div>{fmtDateTime(a.createdAt)}</div>
                      <div className="text-[10px]">{a.createdBy?.username ?? "—"}</div>
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
