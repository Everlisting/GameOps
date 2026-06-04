-- CreateEnum
CREATE TYPE "CrawlerAgentStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "CrawlerTaskStatus" AS ENUM ('PENDING', 'CLAIMED', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CrawlerTaskTrigger" AS ENUM ('AUTO', 'MANUAL');

-- CreateTable
CREATE TABLE "CrawlerAgent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "CrawlerAgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "capabilities" TEXT[],
    "lastSeenAt" TIMESTAMP(3),
    "lastSeenIp" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrawlerAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlerTask" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "csvType" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "trigger" "CrawlerTaskTrigger" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "CrawlerTaskStatus" NOT NULL DEFAULT 'PENDING',
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "errorMessage" TEXT,
    "rawDatasetId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrawlerTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawDataset" (
    "id" TEXT NOT NULL,
    "csvType" TEXT NOT NULL,
    "fileName" TEXT,
    "fileSize" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "rowCount" INTEGER,
    "parsedAt" TIMESTAMP(3),
    "parseError" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawDataset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrawlerAgent_name_key" ON "CrawlerAgent"("name");

-- CreateIndex
CREATE INDEX "CrawlerAgent_status_idx" ON "CrawlerAgent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CrawlerTask_rawDatasetId_key" ON "CrawlerTask"("rawDatasetId");

-- CreateIndex
CREATE INDEX "CrawlerTask_status_priority_createdAt_idx" ON "CrawlerTask"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "CrawlerTask_claimedById_status_idx" ON "CrawlerTask"("claimedById", "status");

-- CreateIndex
CREATE INDEX "CrawlerTask_kind_status_idx" ON "CrawlerTask"("kind", "status");

-- CreateIndex
CREATE INDEX "RawDataset_csvType_createdAt_idx" ON "RawDataset"("csvType", "createdAt");

-- AddForeignKey
ALTER TABLE "CrawlerAgent" ADD CONSTRAINT "CrawlerAgent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlerTask" ADD CONSTRAINT "CrawlerTask_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "CrawlerAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlerTask" ADD CONSTRAINT "CrawlerTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlerTask" ADD CONSTRAINT "CrawlerTask_rawDatasetId_fkey" FOREIGN KEY ("rawDatasetId") REFERENCES "RawDataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
