-- CreateTable
CREATE TABLE "VideoStat" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "creatorUid" TEXT,
    "creatorName" TEXT,
    "creatorAccount" TEXT,
    "creatorId" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "recommendedViews" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "fansGained" INTEGER NOT NULL DEFAULT 0,
    "operatorAgent" TEXT,
    "recruitAgent" TEXT,
    "note" TEXT,
    "lastDatasetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoStat_platform_externalId_key" ON "VideoStat"("platform", "externalId");

-- CreateIndex
CREATE INDEX "VideoStat_creatorId_updatedAt_idx" ON "VideoStat"("creatorId", "updatedAt");

-- CreateIndex
CREATE INDEX "VideoStat_creatorUid_idx" ON "VideoStat"("creatorUid");

-- CreateIndex
CREATE INDEX "VideoStat_publishedAt_idx" ON "VideoStat"("publishedAt");

-- AddForeignKey
ALTER TABLE "VideoStat" ADD CONSTRAINT "VideoStat_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoStat" ADD CONSTRAINT "VideoStat_lastDatasetId_fkey" FOREIGN KEY ("lastDatasetId") REFERENCES "RawDataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
