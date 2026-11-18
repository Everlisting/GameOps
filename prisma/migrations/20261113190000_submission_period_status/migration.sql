-- CreateEnum
CREATE TYPE "SubmissionPeriodStatus" AS ENUM ('REVIEWING', 'FROZEN');

-- AlterTable
ALTER TABLE "SubmissionPeriod" ADD COLUMN     "status" "SubmissionPeriodStatus" NOT NULL DEFAULT 'REVIEWING';

