/**
 * POST /api/operator/knowledge/documents/[id]/reindex — 重新索引(清旧切块,置 pending 交后台)。ADMIN。
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { AppError, badRequest } from "@/lib/errors";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export const POST = route(async (_req, { params }) => {
  await requireRole("ADMIN");
  const id = params?.id;
  if (!id) throw badRequest("缺少 id");
  const doc = await prisma.knowledgeDocument.findUnique({
    where: { id },
    select: { id: true, storagePath: true },
  });
  if (!doc) throw new AppError("NOT_FOUND", "文档不存在");
  if (!doc.storagePath) throw badRequest("该文档无原文件,无法重新索引");
  await prisma.knowledgeChunk.deleteMany({ where: { documentId: id } });
  await prisma.knowledgeDocument.update({
    where: { id },
    data: { status: "pending", error: null, chunkCount: 0 },
  });
  return Response.json({ ok: true });
});
