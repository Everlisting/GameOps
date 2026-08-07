-- DropIndex
DROP INDEX "knowledge_chunk_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "knowledge_document_version" ALTER COLUMN "updatedAt" DROP DEFAULT;
