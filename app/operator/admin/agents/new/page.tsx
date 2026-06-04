/**
 * 管理员 · 新建爬虫机器
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import AgentCreateForm from "../_components/AgentCreateForm";

export default function NewAgentPage() {
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
        <h1 className="text-lg font-semibold">新建爬虫机器</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          创建后会一次性返回 token,关闭弹窗后无法重新查看。
        </p>
      </header>

      <AgentCreateForm />
    </div>
  );
}
