-- CreateTable
CREATE TABLE "ReviewTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SubmissionReviewTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "ReviewTag_parentId_sortOrder_idx" ON "ReviewTag"("parentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "_SubmissionReviewTags_AB_unique" ON "_SubmissionReviewTags"("A", "B");

-- CreateIndex
CREATE INDEX "_SubmissionReviewTags_B_index" ON "_SubmissionReviewTags"("B");

-- AddForeignKey
ALTER TABLE "ReviewTag" ADD CONSTRAINT "ReviewTag_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ReviewTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubmissionReviewTags" ADD CONSTRAINT "_SubmissionReviewTags_A_fkey" FOREIGN KEY ("A") REFERENCES "ReviewTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubmissionReviewTags" ADD CONSTRAINT "_SubmissionReviewTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

