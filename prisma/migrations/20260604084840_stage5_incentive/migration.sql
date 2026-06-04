-- CreateTable
CREATE TABLE "Incentive" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "estimated" DECIMAL(12,2) NOT NULL,
    "adjusted" DECIMAL(12,2),
    "adjustedById" TEXT,
    "adjustedAt" TIMESTAMP(3),
    "adjustReason" TEXT,
    "breakdown" JSONB NOT NULL DEFAULT '[]',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'estimated',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incentive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Incentive_activityId_idx" ON "Incentive"("activityId");

-- CreateIndex
CREATE INDEX "Incentive_creatorId_status_idx" ON "Incentive"("creatorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Incentive_creatorId_activityId_key" ON "Incentive"("creatorId", "activityId");

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incentive" ADD CONSTRAINT "Incentive_adjustedById_fkey" FOREIGN KEY ("adjustedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
