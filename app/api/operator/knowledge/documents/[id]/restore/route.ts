/** POST /api/operator/knowledge/documents/[id]/restore — 原子切回已有索引的历史版本。ADMIN。 */
import { parseJson, route } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { AppError, badRequest, conflict } from "@/lib/errors";
import { requireRole } from "@/lib/rbac";
import { knowledgeRestoreSchema } from "@/lib/validation/assistant";

export const runtime = "nodejs";

export const POST = route(async (req, { params }) => {
  const session = await requireRole("ADMIN");
  const id = params?.id;
  if (!id) throw badRequest("缺少 id");
  const input = await parseJson(req, knowledgeRestoreSchema);

  const target = await prisma.knowledgeDocumentVersion.findFirst({
    where: { id: input.versionId, documentId: id },
    select: { id: true, version: true, status: true, chunkCount: true, checksum: true },
  });
  if (!target) throw new AppError("NOT_FOUND", "历史版本不存在");
  if (target.status !== "published" && target.status !== "superseded") {
    throw conflict("只有已发布过且保留索引的版本可以回滚");
  }

  const actualChunkCount = await prisma.knowledgeChunk.count({ where: { versionId: target.id } });
  if (actualChunkCount === 0 || actualChunkCount !== target.chunkCount) {
    throw conflict("该历史版本的索引不完整，不能直接回滚");
  }

  const previousVersionId = await prisma.$transaction(async (tx) => {
    const doc = await tx.knowledgeDocument.findUnique({
      where: { id },
      select: { publishedVersionId: true },
    });
    if (!doc) throw new AppError("NOT_FOUND", "文档不存在");
    if (doc.publishedVersionId === target.id) return doc.publishedVersionId;
    if (doc.publishedVersionId) {
      await tx.knowledgeDocumentVersion.update({
        where: { id: doc.publishedVersionId },
        data: { status: "superseded" },
      });
    }
    await tx.knowledgeDocumentVersion.update({
      where: { id: target.id },
      data: { status: "published", publishedAt: new Date(), error: null },
    });
    await tx.knowledgeDocument.update({
      where: { id },
      data: {
        publishedVersionId: target.id,
        status: "published",
        error: null,
        chunkCount: target.chunkCount,
      },
    });
    return doc.publishedVersionId;
  });

  if (previousVersionId === target.id) return Response.json({ ok: true, unchanged: true });

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "kb.restore",
    targetType: "knowledge_document",
    targetId: id,
    details: {
      fromVersionId: previousVersionId,
      toVersionId: target.id,
      toVersion: target.version,
      checksum: target.checksum,
    },
  });
  return Response.json({ ok: true });
});
