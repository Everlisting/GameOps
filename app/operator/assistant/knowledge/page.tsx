/**
 * AI 助手 · 知识库(RAG 文档管理,仅 ADMIN)。
 * 建库 / 上传文档(即时切块+嵌入)/ 查看索引状态 / 删除;检索由助手对话的 knowledge_search 工具使用。
 */
import { requireRole } from "@/lib/rbac";

import { KnowledgePanel } from "../_components/KnowledgePanel";

export default async function AssistantKnowledgePage() {
  await requireRole("ADMIN");
  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">AI 助手 · 知识库</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          上传运营手册 / 规则 / 复盘等文档,自动切块并用嵌入模型入库(pgvector)。运营在对话里问制度类问题时,助手会检索并标注来源。需先在「模型设置」配好 embedding 模型。
        </p>
      </header>
      <KnowledgePanel />
    </div>
  );
}
