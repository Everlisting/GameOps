/**
 * POST /api/operator/knowledge/search — 知识库向量检索(OPERATOR;非 ADMIN 仅 visibleToAll 的库)。
 */
import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { knowledgeSearchApiSchema } from "@/lib/validation/assistant";
import { searchKnowledge } from "@/lib/assistant/rag";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const session = await requireRole("OPERATOR");
  const { query, k } = await parseJson(req, knowledgeSearchApiSchema);
  const hits = await searchKnowledge(query, k ?? 8, { isAdmin: session.role === "ADMIN" });
  return Response.json({ hits });
});
