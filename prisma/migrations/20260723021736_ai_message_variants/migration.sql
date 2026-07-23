-- AlterTable
ALTER TABLE "ai_message" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "ai_message_parentId_idx" ON "ai_message"("parentId");
