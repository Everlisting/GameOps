/**
 * AI 助手 · 反馈(运营可见)。查看创作者/运营对助手的反馈。
 */
import { requireRole } from "@/lib/rbac";

import { FeedbackList } from "../_components/FeedbackList";

export default async function AssistantFeedbackPage() {
  await requireRole("OPERATOR");
  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">AI 助手 · 反馈</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          创作者与运营对助手的反馈(评分 + 文字)。近 200 条。
        </p>
      </header>
      <FeedbackList />
    </div>
  );
}
