-- DropIndex
DROP INDEX "knowledge_chunk_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "knowledge_base" ADD COLUMN     "visibleToAll" BOOLEAN NOT NULL DEFAULT true;
