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

/** 切块 → 嵌入 → 入库;更新文档状态。返回块数。失败置 failed 并抛出。 */
export async function ingestDocument(
  documentId: string,
  kbId: string,
  text: string,
): Promise<number> {
  await prisma.knowledgeDocument.update({
    where: { id: documentId },
    data: { status: "indexing", error: null },
  });
  try {
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      await prisma.knowledgeDocument.update({
        where: { id: documentId },
        data: { status: "published", chunkCount: 0 },
      });
      return 0;
    }
    const embeddings = await embedBatch(chunks);
    await prisma.$transaction(
      chunks.map((content, i) => {
        const vec = toVectorLiteral(embeddings[i]);
        return prisma.$executeRaw`
          INSERT INTO "knowledge_chunk" ("id","documentId","kbId","ordinal","content","embedding","tokenCount","createdAt")
          VALUES (${randomUUID()}, ${documentId}, ${kbId}, ${i}, ${content}, ${vec}::vector, ${content.length}, now())`;
      }),
    );
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { status: "published", chunkCount: chunks.length, error: null },
    });
    return chunks.length;
  } catch (err) {
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { status: "failed", error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}

export interface KnowledgeHit {
  chunkId: string;
  content: string;
  documentId: string;
  title: string;
  kbName: string;
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
    SELECT c.id AS "chunkId", c.content, c."documentId", d.title, b.name AS "kbName",
           round((1 - (c.embedding <=> ${vec}::vector))::numeric, 4)::float8 AS score
    FROM "knowledge_chunk" c
    JOIN "knowledge_document" d ON d.id = c."documentId" AND d.status = 'published'
    JOIN "knowledge_base" b ON b.id = c."kbId"
    WHERE c.embedding IS NOT NULL ${aclCond}
    ORDER BY c.embedding <=> ${vec}::vector
    LIMIT ${k}`);
}
