-- AlterTable
ALTER TABLE "VideoStat" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewerId" TEXT,
ADD COLUMN     "reviewerName" TEXT;

-- CreateTable
CREATE TABLE "_VideoReviewTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_VideoReviewTags_AB_unique" ON "_VideoReviewTags"("A", "B");

-- CreateIndex
CREATE INDEX "_VideoReviewTags_B_index" ON "_VideoReviewTags"("B");

-- CreateIndex
CREATE INDEX "VideoStat_reviewStatus_publishedAt_idx" ON "VideoStat"("reviewStatus", "publishedAt");

-- AddForeignKey
ALTER TABLE "VideoStat" ADD CONSTRAINT "VideoStat_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_VideoReviewTags" ADD CONSTRAINT "_VideoReviewTags_A_fkey" FOREIGN KEY ("A") REFERENCES "ReviewTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_VideoReviewTags" ADD CONSTRAINT "_VideoReviewTags_B_fkey" FOREIGN KEY ("B") REFERENCES "VideoStat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

