-- Agent 部署诊断信息:把“鉴权请求活跃”与“心跳进程正常”分开观测。
ALTER TABLE "CrawlerAgent"
  ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3),
  ADD COLUMN "agentVersion" TEXT,
  ADD COLUMN "hostname" TEXT,
  ADD COLUMN "pythonVersion" TEXT,
  ADD COLUMN "gitVersion" TEXT,
  ADD COLUMN "executorStatus" TEXT,
  ADD COLUMN "diagnostics" JSONB;

-- Job/Task 配置版本:新 Task 冻结创建时配置,避免排队期间编辑模板导致错跑。
ALTER TABLE "CrawlerJob"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "CrawlerTask"
  ADD COLUMN "jobRevision" INTEGER,
  ADD COLUMN "jobSnapshot" JSONB;
