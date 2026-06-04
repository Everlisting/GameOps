-- CreateEnum
CREATE TYPE "InspirationType" AS ENUM ('VIDEO_TUTORIAL', 'DOC_TUTORIAL', 'MATERIAL');

-- CreateEnum
CREATE TYPE "MaterialCategory" AS ENUM ('VIDEO', 'IMAGE', 'TEXT_PROMPT', 'TEXT_STORY', 'TEXT_OTHER');

-- CreateTable
CREATE TABLE "Inspiration" (
    "id" TEXT NOT NULL,
    "type" "InspirationType" NOT NULL,
    "category" "MaterialCategory",
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "url" TEXT,
    "coverImage" TEXT,
    "tags" TEXT[],
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspiration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Inspiration_type_published_createdAt_idx" ON "Inspiration"("type", "published", "createdAt");

-- CreateIndex
CREATE INDEX "Inspiration_type_category_published_idx" ON "Inspiration"("type", "category", "published");

-- AddForeignKey
ALTER TABLE "Inspiration" ADD CONSTRAINT "Inspiration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
