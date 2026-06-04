/**
 * 顶栏 · ADMIN 专属:有 ACTIVE 但 10 分钟无心跳的 agent 时显示红色徽章。
 * 服务端组件,layout 调用。
 */
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { prisma } from "@/lib/db";
import { offlineWhere } from "@/lib/agent-offline";

export default async function OfflineAgentBadge() {
  const count = await prisma.crawlerAgent.count({ where: offlineWhere() });
  if (count === 0) return null;
  return (
    <Link
      href="/operator/admin/agents"
      className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
      title="点击查看离线机器"
    >
      <AlertTriangle className="size-3.5" />
      {count} 台机器离线
    </Link>
  );
}
