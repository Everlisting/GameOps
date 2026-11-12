/**
 * 管理员 · 爬虫机器编辑
 *
 * 重构后:删 capabilities 显示,加运行状态(在线 / 离线 10min 阈值)。
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound as nextNotFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { isOffline } from "@/lib/agent-offline";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import AgentEditForm from "../_components/AgentEditForm";

export default async function EditAgentPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("ADMIN");
  const a = await prisma.crawlerAgent.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      status: true,
      lastSeenAt: true,
      lastSeenIp: true,
      lastHeartbeatAt: true,
      agentVersion: true,
      hostname: true,
      pythonVersion: true,
      gitVersion: true,
      executorStatus: true,
      createdAt: true,
      createdBy: { select: { username: true, displayName: true } },
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
          {a.createdBy && ` · ${a.createdBy.displayName ?? a.createdBy.username}`} ·{" "}
          {a.lastSeenAt
            ? `最近心跳 ${fmtDateTime(a.lastSeenAt)}${a.lastSeenIp ? ` (${a.lastSeenIp})` : ""}`
            : "从未上报"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          绑定 Job {a._count.jobs} 个 · 历史任务 {a._count.tasks} 条
        </p>
      </header>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>部署状态</CardTitle>
          <CardDescription>
            Agent 安装完成并持续上报心跳后,这里会显示运行环境与版本。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <StatusItem
            label="独立心跳"
            value={a.lastHeartbeatAt ? fmtDateTime(a.lastHeartbeatAt) : "尚未收到"}
          />
          <StatusItem label="执行器" value={a.executorStatus ?? "未知"} />
          <StatusItem label="Agent 版本" value={a.agentVersion ?? "未上报"} />
          <StatusItem label="主机名" value={a.hostname ?? "未上报"} />
          <StatusItem label="Python" value={a.pythonVersion ?? "未上报"} />
          <StatusItem label="Git" value={a.gitVersion ?? "未上报"} />
        </CardContent>
      </Card>

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

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-all font-medium">{value}</span>
    </div>
  );
}
