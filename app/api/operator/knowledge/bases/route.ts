/**
 * GET  /api/operator/knowledge/bases — 列出知识库 + 文档(ADMIN)
 * POST /api/operator/knowledge/bases — 新建知识库(ADMIN)
 */
import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { kbCreateSchema } from "@/lib/validation/assistant";

export const runtime = "nodejs";

export const GET = route(async () => {
  await requireRole("ADMIN");
  const bases = await prisma.knowledgeBase.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      visibleToOperator: true,
      visibleToCreator: true,
      createdAt: true,
      documents: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          mimeType: true,
          status: true,
          chunkCount: true,
          error: true,
          createdAt: true,
        },
      },
    },
  });
  return Response.json({ bases });
});

export const POST = route(async (req) => {
  const session = await requireRole("ADMIN");
  const input = await parseJson(req, kbCreateSchema);
  const kb = await prisma.knowledgeBase.create({
    data: { name: input.name, description: input.description ?? null, createdById: session.sub },
    select: { id: true },
  });
  return Response.json({ id: kb.id });
});
