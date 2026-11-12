-- CreateEnum
CREATE TYPE "SpecialSettlementMode" AS ENUM ('CONFIRMATION', 'CUTOFF');

-- CreateTable
CREATE TABLE "SpecialActivity" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "filters" JSONB NOT NULL,
    "pools" JSONB NOT NULL,
    "settlementMode" "SpecialSettlementMode" NOT NULL,
    "cutoffAt" TIMESTAMP(3),
    "settlement" JSONB,
    "settledAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpecialActivity_startDate_idx" ON "SpecialActivity"("startDate");

