/**
 * 阶段10.3 · AI 助手 · 知识库检索工具(只读,pgvector 向量检索,含 per-KB 权限)。
 */
import { tool } from "ai";

import type { SessionPayload } from "@/lib/session";
import { TOOL_DEFS } from "@/lib/assistant/tools/schemas";
import { searchKnowledge } from "@/lib/assistant/rag";

export function knowledgeSearchTool(session: SessionPayload) {
  return tool({
    description: TOOL_DEFS.knowledgeSearch.description,
    inputSchema: TOOL_DEFS.knowledgeSearch.input,
    execute: async ({ query, k }) => {
      const hits = await searchKnowledge(query, k ?? 5, { isAdmin: session.role === "ADMIN" });
      return {
        data: hits.map((h) => ({
          title: h.title,
          kb: h.kbName,
          score: h.score,
          content: h.content,
        })),
        asOf: new Date().toISOString(),
        source: "知识库(pgvector 向量检索)",
        links: ["/operator/assistant/knowledge"],
      };
    },
  });
}
