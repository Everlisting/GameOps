/**
 * 阶段10.3 · 知识库 · 切块 / 入库 / 检索。
 *
 * embedding 列是 pgvector(Prisma Unsupported),读写走 raw SQL。
 * MVP:所有 published 文档对全体 OPERATOR 可见(暂无 per-KB ACL,后续可加)。
 */
import { randomUUID } from "node:crypto";
import { Prisma, type Role } from "@prisma/client";

import { prisma } from "@/lib/db";
import { embedBatch, embedOne, toVectorLiteral } from "@/lib/assistant/embed";

/** 按段落打包切块;超长段落硬切,带重叠。目标 ~500 字/块。 */
export function chunkText(text: string, size = 500, overlap = 75): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const paras = clean
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur) {
      chunks.push(cur);
      cur = "";
    }
  };
  for (const p of paras) {
    if (p.length > size) {
      flush();
      for (let i = 0; i < p.length; i += size - overlap) chunks.push(p.slice(i, i + size));
      continue;
    }
    if (cur && (cur + "\n\n" + p).length > size) flush();
    cur = cur ? cur + "\n\n" + p : p;
  }
  flush();
  return chunks;
}

/**
 * 对独立版本切块、嵌入并写入；全部成功后才原子切换文档发布指针。
 * 失败只影响新版本，已有 publishedVersionId 和线上 chunks 保持不变。
 */
export async function ingestKnowledgeVersion(
  versionId: string,
  documentId: string,
  kbId: string,
  text: string,
): Promise<number> {
  try {
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("正文为空，未生成任何知识切块");
    const embeddings = await embedBatch(chunks);
    await prisma.knowledgeChunk.deleteMany({ where: { versionId } });
    await prisma.$transaction(
      chunks.map((content, i) => {
        const vec = toVectorLiteral(embeddings[i]);
        return prisma.$executeRaw`
          INSERT INTO "knowledge_chunk" ("id","documentId","versionId","kbId","ordinal","content","embedding","tokenCount","createdAt")
          VALUES (${randomUUID()}, ${documentId}, ${versionId}, ${kbId}, ${i}, ${content}, ${vec}::vector, ${content.length}, now())`;
      }),
    );

    await prisma.$transaction(async (tx) => {
      const doc = await tx.knowledgeDocument.findUnique({
        where: { id: documentId },
        select: { publishedVersionId: true },
      });
      if (!doc) throw new Error("知识库文档已被删除");
      if (doc.publishedVersionId && doc.publishedVersionId !== versionId) {
        await tx.knowledgeDocumentVersion.update({
          where: { id: doc.publishedVersionId },
          data: { status: "superseded" },
        });
      }
      await tx.knowledgeDocumentVersion.update({
        where: { id: versionId },
        data: {
          status: "published",
          chunkCount: chunks.length,
          error: null,
          publishedAt: new Date(),
        },
      });
      await tx.knowledgeDocument.update({
        where: { id: documentId },
        data: {
          publishedVersionId: versionId,
          status: "published",
          chunkCount: chunks.length,
          error: null,
        },
      });
    });
    return chunks.length;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.knowledgeDocumentVersion
      .update({ where: { id: versionId }, data: { status: "failed", error: message } })
      .catch(() => {});
    const doc = await prisma.knowledgeDocument
      .findUnique({ where: { id: documentId }, select: { publishedVersionId: true } })
      .catch(() => null);
    if (doc && !doc.publishedVersionId) {
      await prisma.knowledgeDocument
        .update({ where: { id: documentId }, data: { status: "failed", error: message } })
        .catch(() => {});
    }
    throw err;
  }
}

export interface KnowledgeHit {
  chunkId: string;
  content: string;
  documentId: string;
  title: string;
  kbName: string;
  version: number;
  score: number;
}

/** 向量检索 top-k(仅 published 文档);按角色过滤知识库:ADMIN 全见,OPERATOR 看 visibleToOperator,CREATOR 看 visibleToCreator。 */
export async function searchKnowledge(
  query: string,
  k = 5,
  opts: { role?: Role } = {},
): Promise<KnowledgeHit[]> {
  const vec = toVectorLiteral(await embedOne(query));
  const aclCond =
    opts.role === "ADMIN"
      ? Prisma.empty
      : opts.role === "CREATOR"
        ? Prisma.sql`AND b."visibleToCreator" = true`
        : Prisma.sql`AND b."visibleToOperator" = true`;
  return prisma.$queryRaw<KnowledgeHit[]>(Prisma.sql`
    SELECT c.id AS "chunkId", c.content, c."documentId", d.title, b.name AS "kbName", v.version,
           round((1 - (c.embedding <=> ${vec}::vector))::numeric, 4)::float8 AS score
    FROM "knowledge_chunk" c
    JOIN "knowledge_document" d
      ON d.id = c."documentId" AND d."publishedVersionId" = c."versionId"
    JOIN "knowledge_document_version" v
      ON v.id = c."versionId" AND v.status = 'published'
    JOIN "knowledge_base" b ON b.id = c."kbId"
    WHERE c.embedding IS NOT NULL ${aclCond}
    ORDER BY c.embedding <=> ${vec}::vector
    LIMIT ${k}`);
}
