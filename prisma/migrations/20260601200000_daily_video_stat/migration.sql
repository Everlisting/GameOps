-- CreateTable
CREATE TABLE "DailyVideoStat" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "views" INTEGER NOT NULL,
    "recommendedViews" INTEGER NOT NULL,
    "likes" INTEGER NOT NULL,
    "comments" INTEGER NOT NULL,
    "shares" INTEGER NOT NULL,
    "fansGained" INTEGER NOT NULL,
    "creatorId" TEXT,
    "videoStatId" TEXT,
    "datasetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyVideoStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyVideoStat_platform_externalId_snapshotDate_key" ON "DailyVideoStat"("platform", "externalId", "snapshotDate");

-- CreateIndex
CREATE INDEX "DailyVideoStat_snapshotDate_idx" ON "DailyVideoStat"("snapshotDate");

-- CreateIndex
CREATE INDEX "DailyVideoStat_creatorId_snapshotDate_idx" ON "DailyVideoStat"("creatorId", "snapshotDate");

-- CreateIndex
CREATE INDEX "DailyVideoStat_videoStatId_snapshotDate_idx" ON "DailyVideoStat"("videoStatId", "snapshotDate");

-- AddForeignKey
ALTER TABLE "DailyVideoStat" ADD CONSTRAINT "DailyVideoStat_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyVideoStat" ADD CONSTRAINT "DailyVideoStat_videoStatId_fkey" FOREIGN KEY ("videoStatId") REFERENCES "VideoStat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyVideoStat" ADD CONSTRAINT "DailyVideoStat_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "RawDataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
