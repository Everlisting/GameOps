import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/rbac";

import { KnowledgeEditor } from "../../_components/KnowledgeEditor";

export default async function KnowledgeDocumentPage({ params }: { params: { id: string } }) {
  await requireRole("ADMIN");
  return (
    <div className="flex flex-col gap-6 p-8">
      <header className="flex flex-col gap-2">
        <Button variant="link" size="sm" asChild className="w-fit px-0">
          <Link href="/operator/assistant/knowledge">← 返回知识库</Link>
        </Button>
        <div>
          <h1 className="text-lg font-semibold">知识库文档</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            在线编辑规范化正文，显式发布后才更新 AI 助手检索版本。
          </p>
        </div>
      </header>
      <KnowledgeEditor documentId={params.id} />
    </div>
  );
}
