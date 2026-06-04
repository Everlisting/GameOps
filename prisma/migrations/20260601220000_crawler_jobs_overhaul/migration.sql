-- ============================================================================
-- 阶段4 改造:废抢占式,引入 Job/Task 两层 + 强制 Agent 绑定
--   · CrawlerAgent 删 capabilities
--   · CrawlerTask 删 kind/csvType/claimedAt/rawDatasetId/attemptCount/maxAttempts
--     rename claimedById→agentId, params→paramValues
--     add jobId/sequenceNumber/exitCode/logPath
--   · RawDataset 加 taskId(原 CrawlerTask.rawDatasetId 反向)
--   · CrawlerJob 新表(模板:仓库 + 命令 + 参数 schema + 产物清单 + cron)
--   · CrawlerTaskStatus.CLAIMED → RUNNING(枚举值 RENAME,数据保留)
-- ============================================================================

-- 1. 删旧的外键 & 索引(都引用即将变化的列)
ALTER TABLE "CrawlerTask" DROP CONSTRAINT IF EXISTS "CrawlerTask_claimedById_fkey";
ALTER TABLE "CrawlerTask" DROP CONSTRAINT IF EXISTS "CrawlerTask_rawDatasetId_fkey";
DROP INDEX IF EXISTS "CrawlerTask_rawDatasetId_key";
DROP INDEX IF EXISTS "CrawlerTask_claimedById_status_idx";
DROP INDEX IF EXISTS "CrawlerTask_kind_status_idx";

-- 2. 枚举值改名(历史 CLAIMED 行自动变 RUNNING)
ALTER TYPE "CrawlerTaskStatus" RENAME VALUE 'CLAIMED' TO 'RUNNING';

-- 3. 新增枚举
CREATE TYPE "CrawlerRepoType" AS ENUM ('GIT', 'SVN');
CREATE TYPE "CrawlerJobParamType" AS ENUM ('DATE', 'STRING', 'NUMBER', 'ENUM');

-- 4. CrawlerAgent:删 capabilities
ALTER TABLE "CrawlerAgent" DROP COLUMN "capabilities";

-- 5. CrawlerTask:删字段
ALTER TABLE "CrawlerTask"
  DROP COLUMN "kind",
  DROP COLUMN "csvType",
  DROP COLUMN "claimedAt",
  DROP COLUMN "rawDatasetId",
  DROP COLUMN "attemptCount",
  DROP COLUMN "maxAttempts";

-- 6. CrawlerTask:列改名(保留数据)
ALTER TABLE "CrawlerTask" RENAME COLUMN "claimedById" TO "agentId";
ALTER TABLE "CrawlerTask" RENAME COLUMN "params" TO "paramValues";

-- 7. CrawlerTask:列默认值同步(prisma schema 标了 @default("{}"))
ALTER TABLE "CrawlerTask" ALTER COLUMN "paramValues" SET DEFAULT '{}';

-- 8. CrawlerTask:新增列(历史行 NULL)
ALTER TABLE "CrawlerTask"
  ADD COLUMN "jobId" TEXT,
  ADD COLUMN "sequenceNumber" INTEGER,
  ADD COLUMN "exitCode" INTEGER,
  ADD COLUMN "logPath" TEXT;

-- 9. RawDataset:加 taskId
ALTER TABLE "RawDataset" ADD COLUMN "taskId" TEXT;

-- 10. CrawlerJob 新表
CREATE TABLE "CrawlerJob" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "agentId" TEXT NOT NULL,
    "repoType" "CrawlerRepoType" NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "repoBranch" TEXT,
    "workdir" TEXT NOT NULL DEFAULT '.',
    "command" TEXT NOT NULL,
    "timeoutMinutes" INTEGER NOT NULL DEFAULT 30,
    "paramSchema" JSONB NOT NULL DEFAULT '[]',
    "outputs" JSONB NOT NULL DEFAULT '[]',
    "cronExpression" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrawlerJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrawlerJob_name_key" ON "CrawlerJob"("name");
CREATE INDEX "CrawlerJob_agentId_enabled_idx" ON "CrawlerJob"("agentId", "enabled");
CREATE INDEX "CrawlerJob_enabled_cronExpression_idx" ON "CrawlerJob"("enabled", "cronExpression");

-- 11. 新索引 + 外键
CREATE INDEX "CrawlerTask_agentId_status_priority_createdAt_idx"
    ON "CrawlerTask"("agentId", "status", "priority", "createdAt");
CREATE INDEX "CrawlerTask_jobId_sequenceNumber_idx"
    ON "CrawlerTask"("jobId", "sequenceNumber");
CREATE INDEX "RawDataset_taskId_idx" ON "RawDataset"("taskId");

ALTER TABLE "CrawlerTask" ADD CONSTRAINT "CrawlerTask_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "CrawlerAgent"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrawlerTask" ADD CONSTRAINT "CrawlerTask_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "CrawlerJob"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrawlerJob" ADD CONSTRAINT "CrawlerJob_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "CrawlerAgent"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrawlerJob" ADD CONSTRAINT "CrawlerJob_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RawDataset" ADD CONSTRAINT "RawDataset_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "CrawlerTask"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
