-- CreateTable
CREATE TABLE "AnchorStat" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "nickname" TEXT,
    "account" TEXT,
    "joinedAt" TIMESTAMP(3),
    "groupNo" TEXT,
    "operatorAgent" TEXT,
    "recruitAgent" TEXT,
    "fans" INTEGER NOT NULL DEFAULT 0,
    "worksCount" INTEGER NOT NULL DEFAULT 0,
    "worksViews" INTEGER NOT NULL DEFAULT 0,
    "worksRecommendedViews" INTEGER NOT NULL DEFAULT 0,
    "anchorDays" INTEGER NOT NULL DEFAULT 0,
    "acu" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "liveDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "liveSessions" INTEGER NOT NULL DEFAULT 0,
    "exposureUsers" INTEGER NOT NULL DEFAULT 0,
    "exposureCount" INTEGER NOT NULL DEFAULT 0,
    "enterRoomUsers" INTEGER NOT NULL DEFAULT 0,
    "enterRoomCount" INTEGER NOT NULL DEFAULT 0,
    "avgWatchDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastDatasetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnchorStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnchorStat_groupNo_idx" ON "AnchorStat"("groupNo");

-- CreateIndex
CREATE INDEX "AnchorStat_updatedAt_idx" ON "AnchorStat"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnchorStat_platform_uid_key" ON "AnchorStat"("platform", "uid");

-- AddForeignKey
ALTER TABLE "AnchorStat" ADD CONSTRAINT "AnchorStat_lastDatasetId_fkey" FOREIGN KEY ("lastDatasetId") REFERENCES "RawDataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
