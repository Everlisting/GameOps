/**
 * 管理员 · 爬虫机器编辑
 *
 * 重构后:删 capabilities 显示,加运行状态(在线 / 离线 10min 阈值)。
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound as nextNotFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { isOffline } from "@/lib/agent-offline";
import { Badge } from "@/components/ui/badge";

import AgentEditForm from "../_components/AgentEditForm";

export default async function EditAgentPage({
  params,
}: {
  params: { id: string };
}) {
  const a = await prisma.crawlerAgent.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      status: true,
      lastSeenAt: true,
      lastSeenIp: true,
      createdAt: true,
      createdBy: { select: { username: true } },
      _count: { select: { jobs: true, tasks: true } },
    },
  });
  if (!a) nextNotFound();

  const offline = isOffline(a.lastSeenAt, a.status);

  return (
    <div className="p-8">
      <div className="mb-4">
        <Link
          href="/operator/admin/agents"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          返回机器列表
        </Link>
      </div>

      <header className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">{a.name}</h1>
          {a.status === "ACTIVE" ? (
            offline ? (
              <Badge variant="destructive">离线</Badge>
            ) : (
              <Badge variant="success">在线</Badge>
            )
          ) : (
            <Badge variant="muted">停用</Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          创建于 {fmtDateTime(a.createdAt)}
          {a.createdBy && ` · ${a.createdBy.username}`} ·{" "}
          {a.lastSeenAt
            ? `最近心跳 ${fmtDateTime(a.lastSeenAt)}${a.lastSeenIp ? ` (${a.lastSeenIp})` : ""}`
            : "从未上报"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          绑定 Job {a._count.jobs} 个 · 历史任务 {a._count.tasks} 条
        </p>
      </header>

      <AgentEditForm
        initial={{
          id: a.id,
          name: a.name,
          status: a.status,
        }}
      />
    </div>
  );
}
