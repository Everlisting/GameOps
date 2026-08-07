/** POST /api/operator/knowledge/documents/[id]/reindex — 创建独立索引版本，不删除线上 chunks。ADMIN。 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { AppError, badRequest, conflict } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { knowledgeContentChecksum } from "@/lib/assistant/knowledge-version";

export const runtime = "nodejs";

export const POST = route(async (_req, { params }) => {
  const session = await requireRole("ADMIN");
  const id = params?.id;
  if (!id) throw badRequest("缺少 id");
  const doc = await prisma.knowledgeDocument.findUnique({
    where: { id },
    select: {
      id: true,
      storagePath: true,
      publishedVersionId: true,
      versions: {
        orderBy: { version: "desc" },
        select: {
          id: true,
          version: true,
          content: true,
          format: true,
          checksum: true,
          status: true,
          revision: true,
        },
      },
    },
  });
  if (!doc) throw new AppError("NOT_FOUND", "文档不存在");
  if (doc.versions.some((version) =>
    version.status === "draft" || version.status === "failed" || version.status === "parsing" || version.status === "pending" || version.status === "indexing",
  )) {
    throw conflict("已有草稿或索引任务，请先完成当前版本");
  }

  const published = doc.versions.find((version) => version.id === doc.publishedVersionId);
  let queuedVersion: number | null = null;
  if (published) {
    queuedVersion = (doc.versions[0]?.version ?? 0) + 1;
    await prisma.knowledgeDocumentVersion.create({
      data: {
        documentId: id,
        version: queuedVersion,
        content: doc.storagePath ? "" : published.content,
        format: published.format,
        status: doc.storagePath ? "parsing" : "pending",
        checksum: doc.storagePath
          ? knowledgeContentChecksum("")
          : published.checksum || knowledgeContentChecksum(published.content),
        createdById: session.sub,
        updatedById: session.sub,
      },
    });
  } else {
    const retryable = doc.versions.find(
      (version) => version.status === "failed" && version.content.trim().length > 0,
    );
    if (retryable) {
      await prisma.knowledgeDocumentVersion.update({
        where: { id: retryable.id },
        data: { status: "pending", error: null },
      });
      queuedVersion = retryable.version;
    } else {
      if (!doc.storagePath) throw badRequest("该文档没有可重建的正文或原件");
      await prisma.knowledgeDocument.update({
        where: { id },
        data: { status: "pending", error: null },
      });
    }
  }

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "kb.reindex",
    targetType: "knowledge_document",
    targetId: id,
    details: { version: queuedVersion },
  });
  return Response.json({ ok: true });
});
