-- CreateTable
CREATE TABLE "ai_tool_call" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "resultSummary" JSONB,
    "latencyMs" INTEGER,
    "isError" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_tool_call_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_tool_call_runId_idx" ON "ai_tool_call"("runId");

-- AddForeignKey
ALTER TABLE "ai_tool_call" ADD CONSTRAINT "ai_tool_call_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ai_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
