-- 日志系统 · 阶段4 · 高价值运行错误留档(error/fatal + persist)。隔离有界队列写入。
CREATE TABLE "error_log" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "release" TEXT,
    "instanceId" TEXT,
    "module" TEXT NOT NULL,
    "event" TEXT,
    "msg" TEXT NOT NULL,
    "requestId" TEXT,
    "traceId" TEXT,
    "taskId" TEXT,
    "runId" TEXT,
    "userIdHash" TEXT,
    "errName" TEXT,
    "errMessage" TEXT,
    "errStack" TEXT,
    "errCode" TEXT,
    "fingerprint" TEXT NOT NULL,
    "fields" JSONB,

    CONSTRAINT "error_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "error_log_occurredAt_idx" ON "error_log"("occurredAt");
CREATE INDEX "error_log_module_level_occurredAt_idx" ON "error_log"("module", "level", "occurredAt");
CREATE INDEX "error_log_requestId_idx" ON "error_log"("requestId");
CREATE INDEX "error_log_traceId_idx" ON "error_log"("traceId");
CREATE INDEX "error_log_taskId_occurredAt_idx" ON "error_log"("taskId", "occurredAt");
CREATE INDEX "error_log_fingerprint_occurredAt_idx" ON "error_log"("fingerprint", "occurredAt");
