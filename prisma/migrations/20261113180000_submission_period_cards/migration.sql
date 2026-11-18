-- CreateTable
CREATE TABLE "SubmissionPeriod" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmissionPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubmissionPeriod_startDate_idx" ON "SubmissionPeriod"("startDate");

