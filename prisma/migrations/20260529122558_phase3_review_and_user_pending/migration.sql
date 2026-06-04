-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "contentNote" TEXT,
ADD COLUMN     "contentStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "titleNote" TEXT,
ADD COLUMN     "titleStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "yishanNote" TEXT,
ADD COLUMN     "yishanStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'pending';

-- CreateIndex
CREATE UNIQUE INDEX "Submission_platform_externalId_key" ON "Submission"("platform", "externalId");
