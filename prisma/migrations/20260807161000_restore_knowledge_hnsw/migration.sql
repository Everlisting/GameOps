-- Prisma 无法在 schema 中表达 pgvector HNSW operator class；结构同步后显式恢复索引。
CREATE INDEX IF NOT EXISTS "knowledge_chunk_embedding_hnsw_idx"
    ON "knowledge_chunk" USING hnsw ("embedding" vector_cosine_ops);
