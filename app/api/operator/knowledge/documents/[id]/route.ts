/**
 * GET    /api/operator/knowledge/documents/[id] — 在线查看正文、草稿和版本历史。ADMIN。
 * PATCH  /api/operator/knowledge/documents/[id] — 更新标题 / 乐观锁保存正文草稿。ADMIN。
 * DELETE /api/operator/knowledge/documents/[id] — 删除文档、版本、切块和原件。ADMIN。
 */
import { Prisma } from "@prisma/client";

import { parseJson, route } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { knowledgeContentChecksum } from "@/lib/assistant/knowledge-version";
import { removeKbFile } from "@/lib/assistant/kb-storage";
import { prisma } from "@/lib/db";
import { AppError, badRequest, conflict } from "@/lib/errors";
import { requireRole } from "@/lib/rbac";
import { knowledgeDocumentPatchSchema } from "@/lib/validation/assistant";

export const runtime = "nodejs";

const versionSelect = {
  id: true,
  version: true,
  content: true,
  format: true,
  status: true,
  revision: true,
  checksum: true,
  error: true,
  chunkCount: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
} satisfies Prisma.KnowledgeDocumentVersionSelect;

export const GET = route(async (_req, { params }) => {
  await requireRole("ADMIN");
  const id = params?.id;
  if (!id) throw badRequest("缺少 id");

  const doc = await prisma.knowledgeDocument.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      source: true,
      mimeType: true,
      storagePath: true,
      status: true,
      error: true,
      publishedVersionId: true,
      updatedAt: true,
      kb: { select: { id: true, name: true } },
      versions: { orderBy: { version: "desc" }, select: versionSelect },
    },
  });
  if (!doc) throw new AppError("NOT_FOUND", "文档不存在");

  const editable = doc.versions.find(
    (version) => version.status === "draft" || version.status === "failed",
  );
  const processing = doc.versions.find(
    (version) =>
      version.status === "parsing" || version.status === "pending" || version.status === "indexing",
  );
  const currentWork = editable ?? processing;
  const published = doc.versions.find((version) => version.id === doc.publishedVersionId) ?? null;
  const nextVersion = (doc.versions[0]?.version ?? 0) + 1;

  return Response.json({
    document: {
      id: doc.id,
      title: doc.title,
      source: doc.source,
      mimeType: doc.mimeType,
      hasOriginal: !!doc.storagePath,
      status: doc.status,
      error: doc.error,
      updatedAt: doc.updatedAt,
      kb: doc.kb,
    },
    draft: currentWork
      ? currentWork
      : {
          id: null,
          version: nextVersion,
          content: published?.content ?? "",
          format: published?.format ?? "markdown",
          status: "new",
          revision: 0,
          checksum: published?.checksum ?? knowledgeContentChecksum(""),
          error: null,
          chunkCount: 0,
          createdAt: null,
          updatedAt: null,
          publishedAt: null,
        },
    published,
    versions: doc.versions.map(({ content: _content, ...version }) => version),
  });
});

export const PATCH = route(async (req, { params }) => {
  const session = await requireRole("ADMIN");
  const id = params?.id;
  if (!id) throw badRequest("缺少 id");
  const input = await parseJson(req, knowledgeDocumentPatchSchema);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const doc = await tx.knowledgeDocument.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          status: true,
          publishedVersionId: true,
          versions: {
            orderBy: { version: "desc" },
            select: {
              id: true,
              version: true,
              content: true,
              format: true,
              status: true,
              revision: true,
            },
          },
        },
      });
      if (!doc) throw new AppError("NOT_FOUND", "文档不存在");

      if (input.title !== undefined && input.title !== doc.title) {
        await tx.knowledgeDocument.update({ where: { id }, data: { title: input.title } });
      }

      if (input.content === undefined && input.format === undefined) {
        return { title: input.title ?? doc.title, version: null, revision: null, checksum: null };
      }

      if (doc.versions.some((version) =>
        version.status === "parsing" || version.status === "pending" || version.status === "indexing",
      )) {
        throw conflict("已有版本正在索引，请等待完成后再编辑");
      }
      if (doc.versions.length === 0 && (doc.status === "pending" || doc.status === "indexing")) {
        throw conflict("原件正在解析，请等待完成后再编辑");
      }

      const editable = doc.versions.find(
        (version) => version.status === "draft" || version.status === "failed",
      );
      const baseRevision = input.baseRevision ?? -1;

      if (editable) {
        if (baseRevision !== editable.revision) {
          throw conflict("草稿已被其他页面修改，请刷新后重新合并", {
            expectedRevision: editable.revision,
          });
        }
        const content = input.content ?? editable.content;
        const checksum = knowledgeContentChecksum(content);
        const updated = await tx.knowledgeDocumentVersion.updateMany({
          where: {
            id: editable.id,
            revision: baseRevision,
            status: { in: ["draft", "failed"] },
          },
          data: {
            content,
            format: input.format ?? editable.format,
            checksum,
            revision: { increment: 1 },
            status: "draft",
            error: null,
            updatedById: session.sub,
          },
        });
        if (updated.count !== 1) throw conflict("草稿已被其他页面修改，请刷新后重试");
        return {
          title: input.title ?? doc.title,
          version: editable.version,
          revision: baseRevision + 1,
          checksum,
        };
      }

      if (baseRevision !== 0) {
        throw conflict("草稿状态已变化，请刷新后重试", { expectedRevision: 0 });
      }
      const published = doc.versions.find((version) => version.id === doc.publishedVersionId);
      const content = input.content ?? published?.content ?? "";
      const checksum = knowledgeContentChecksum(content);
      const nextVersion = (doc.versions[0]?.version ?? 0) + 1;
      const created = await tx.knowledgeDocumentVersion.create({
        data: {
          documentId: id,
          version: nextVersion,
          content,
          format: input.format ?? published?.format ?? "markdown",
          status: "draft",
          revision: 1,
          checksum,
          createdById: session.sub,
          updatedById: session.sub,
        },
        select: { version: true, revision: true },
      });
      return { title: input.title ?? doc.title, ...created, checksum };
    });

    await recordAudit({
      actorId: session.sub,
      actorUsername: session.username,
      action: "kb.draft.update",
      targetType: "knowledge_document",
      targetId: id,
      details: {
        title: result.title,
        version: result.version,
        revision: result.revision,
        checksum: result.checksum,
      },
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw conflict("草稿已由其他页面创建，请刷新后重试");
    }
    throw error;
  }
});

export const DELETE = route(async (_req, { params }) => {
  const session = await requireRole("ADMIN");
  const id = params?.id;
  if (!id) throw badRequest("缺少 id");
  const doc = await prisma.knowledgeDocument.findUnique({
    where: { id },
    select: { id: true, title: true, storagePath: true },
  });
  if (!doc) throw new AppError("NOT_FOUND", "文档不存在");
  await prisma.$transaction([
    prisma.knowledgeDocument.update({ where: { id }, data: { publishedVersionId: null } }),
    prisma.knowledgeDocument.delete({ where: { id } }),
  ]);
  await removeKbFile(doc.storagePath);
  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "kb.delete",
    targetType: "knowledge_document",
    targetId: id,
    details: { title: doc.title },
  });
  return Response.json({ ok: true });
});
