-- CreateTable
CREATE TABLE "LiveStat" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "nickname" TEXT,
    "account" TEXT,
    "soundWave" INTEGER NOT NULL DEFAULT 0,
    "liveDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exposureUsers" INTEGER NOT NULL DEFAULT 0,
    "exposureCount" INTEGER NOT NULL DEFAULT 0,
    "enterRoomUsers" INTEGER NOT NULL DEFAULT 0,
    "enterRoomCount" INTEGER NOT NULL DEFAULT 0,
    "enterRoomRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgWatchDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tipUsers" INTEGER NOT NULL DEFAULT 0,
    "tipCount" INTEGER NOT NULL DEFAULT 0,
    "newFans" INTEGER NOT NULL DEFAULT 0,
    "acu" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "operatorAgent" TEXT,
    "recruitAgent" TEXT,
    "note" TEXT,
    "lastDatasetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveStat_uid_date_idx" ON "LiveStat"("uid", "date");

-- CreateIndex
CREATE INDEX "LiveStat_date_idx" ON "LiveStat"("date");

-- CreateIndex
CREATE INDEX "LiveStat_note_idx" ON "LiveStat"("note");

-- CreateIndex
CREATE UNIQUE INDEX "LiveStat_platform_uid_date_key" ON "LiveStat"("platform", "uid", "date");

-- AddForeignKey
ALTER TABLE "LiveStat" ADD CONSTRAINT "LiveStat_lastDatasetId_fkey" FOREIGN KEY ("lastDatasetId") REFERENCES "RawDataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
