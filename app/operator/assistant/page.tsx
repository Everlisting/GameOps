/**
 * AI 助手 · 对话工作台(OPERATOR)。
 * 阶段 10.1:纯对话;数据工具将于 10.2 接入。
 */
import { requireRole } from "@/lib/rbac";
import { readPublicProfile } from "@/lib/assistant/settings";

import { AssistantChat } from "./_components/AssistantChat";

export default async function AssistantPage() {
  const session = await requireRole("OPERATOR");
  const p = await readPublicProfile("chat");

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col p-6">
      <header className="mb-3">
        <h1 className="text-lg font-semibold">AI 助手</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          自然语言问项目数据(视频 / 主播 / 活动 / 激励 / 采集任务),自动取数并标注统计口径与来源。
        </p>
      </header>
      <AssistantChat configured={p.configured} isAdmin={session.role === "ADMIN"} />
    </div>
  );
}
