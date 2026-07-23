/**
 * AI 助手 · 知识检索(OPERATOR)。直接检索知识库片段,尊重 per-KB 权限。
 */
import { requireRole } from "@/lib/rbac";

import { KnowledgeSearch } from "../_components/KnowledgeSearch";

export default async function AssistantSearchPage() {
  await requireRole("OPERATOR");
  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">AI 助手 · 知识检索</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          直接向量检索知识库,查看命中片段与来源文档(与对话里 knowledge_search 同源)。非管理员仅能检索「全体可见」的知识库。
        </p>
      </header>
      <KnowledgeSearch />
    </div>
  );
}
