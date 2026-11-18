-- CreateTable
CREATE TABLE "VideoReviewAssignment" (
    "videoId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoReviewAssignment_pkey" PRIMARY KEY ("videoId")
);

-- CreateIndex
CREATE INDEX "VideoReviewAssignment_reviewerId_periodId_idx" ON "VideoReviewAssignment"("reviewerId", "periodId");

-- CreateIndex
CREATE INDEX "VideoReviewAssignment_periodId_idx" ON "VideoReviewAssignment"("periodId");

-- AddForeignKey
ALTER TABLE "VideoReviewAssignment" ADD CONSTRAINT "VideoReviewAssignment_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "VideoStat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoReviewAssignment" ADD CONSTRAINT "VideoReviewAssignment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "SubmissionPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoReviewAssignment" ADD CONSTRAINT "VideoReviewAssignment_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoReviewAssignment" ADD CONSTRAINT "VideoReviewAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

