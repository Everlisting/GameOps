-- AlterTable
ALTER TABLE "VideoStat" ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hiddenAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "VideoStat_platform_hidden_idx" ON "VideoStat"("platform", "hidden");
