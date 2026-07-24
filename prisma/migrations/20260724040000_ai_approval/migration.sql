-- 阶段10.4 · 需审批的写操作:AiApproval 状态机(pending → approved/rejected → executed/failed)
CREATE TABLE "ai_approval" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "runId" TEXT,
    "action" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "preview" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" JSONB,
    "errorMessage" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_approval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_approval_status_createdAt_idx" ON "ai_approval"("status", "createdAt");
CREATE INDEX "ai_approval_conversationId_idx" ON "ai_approval"("conversationId");
