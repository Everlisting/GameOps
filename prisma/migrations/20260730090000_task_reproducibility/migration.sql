-- P3:冻结实际源码 revision、逐次执行环境与重跑来源。
ALTER TABLE "CrawlerTask"
  ADD COLUMN "sourceRevision" TEXT,
  ADD COLUMN "executionSnapshot" JSONB,
  ADD COLUMN "rerunOfTaskId" TEXT;

CREATE INDEX "CrawlerTask_rerunOfTaskId_idx"
  ON "CrawlerTask"("rerunOfTaskId");

ALTER TABLE "CrawlerTask"
  ADD CONSTRAINT "CrawlerTask_rerunOfTaskId_fkey"
  FOREIGN KEY ("rerunOfTaskId")
  REFERENCES "CrawlerTask"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
