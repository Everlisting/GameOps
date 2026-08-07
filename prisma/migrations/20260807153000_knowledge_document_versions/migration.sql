-- 在线编辑采用版本化正文：原件不可变，索引成功后再切换发布指针。
CREATE TABLE "knowledge_document_version" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'markdown',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "checksum" TEXT NOT NULL,
    "error" TEXT,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "knowledge_document_version_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "knowledge_document" ADD COLUMN "publishedVersionId" TEXT;
ALTER TABLE "knowledge_chunk" ADD COLUMN "versionId" TEXT;

-- 已有文档只能从历史 chunks 兼容生成 v1；以后所有正文均来自版本表，禁止反向拼 chunks。
INSERT INTO "knowledge_document_version" (
    "id", "documentId", "version", "content", "format", "status", "revision",
    "checksum", "error", "chunkCount", "createdById", "updatedById",
    "createdAt", "updatedAt", "publishedAt"
)
SELECT
    d."id" || '_v1',
    d."id",
    1,
    COALESCE((
        SELECT string_agg(c."content", E'\n\n' ORDER BY c."ordinal")
        FROM "knowledge_chunk" c
        WHERE c."documentId" = d."id"
    ), ''),
    'markdown',
    CASE WHEN d."status" = 'published' THEN 'published' ELSE 'failed' END,
    1,
    md5(COALESCE((
        SELECT string_agg(c."content", E'\n\n' ORDER BY c."ordinal")
        FROM "knowledge_chunk" c
        WHERE c."documentId" = d."id"
    ), '')),
    d."error",
    d."chunkCount",
    d."createdById",
    d."createdById",
    d."createdAt",
    d."updatedAt",
    CASE WHEN d."status" = 'published' THEN d."updatedAt" ELSE NULL END
FROM "knowledge_document" d
WHERE d."status" = 'published'
   OR EXISTS (SELECT 1 FROM "knowledge_chunk" c WHERE c."documentId" = d."id");

UPDATE "knowledge_chunk"
SET "versionId" = "documentId" || '_v1';

UPDATE "knowledge_document"
SET "publishedVersionId" = "id" || '_v1'
WHERE "status" = 'published';

ALTER TABLE "knowledge_chunk" ALTER COLUMN "versionId" SET NOT NULL;

CREATE UNIQUE INDEX "knowledge_document_publishedVersionId_key"
    ON "knowledge_document"("publishedVersionId");
CREATE UNIQUE INDEX "knowledge_document_version_documentId_version_key"
    ON "knowledge_document_version"("documentId", "version");
CREATE INDEX "knowledge_document_version_documentId_status_idx"
    ON "knowledge_document_version"("documentId", "status");
CREATE UNIQUE INDEX "knowledge_chunk_versionId_ordinal_key"
    ON "knowledge_chunk"("versionId", "ordinal");

ALTER TABLE "knowledge_document_version"
    ADD CONSTRAINT "knowledge_document_version_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "knowledge_document"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "knowledge_chunk"
    ADD CONSTRAINT "knowledge_chunk_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "knowledge_document_version"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "knowledge_document"
    ADD CONSTRAINT "knowledge_document_publishedVersionId_fkey"
    FOREIGN KEY ("publishedVersionId") REFERENCES "knowledge_document_version"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 20260723042102 曾删除该索引；向量规模增长前补回。
CREATE INDEX IF NOT EXISTS "knowledge_chunk_embedding_hnsw_idx"
    ON "knowledge_chunk" USING hnsw ("embedding" vector_cosine_ops);
