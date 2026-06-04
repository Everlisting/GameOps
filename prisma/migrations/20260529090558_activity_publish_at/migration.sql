-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "publishAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Activity_status_publishAt_idx" ON "Activity"("status", "publishAt");
