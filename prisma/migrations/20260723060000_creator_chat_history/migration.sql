-- 创作者对话历史:区分受众(operator/creator);反馈评分改可空(支持纯文本反馈)
ALTER TABLE "ai_conversation" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'operator';
ALTER TABLE "ai_feedback" ALTER COLUMN "rating" DROP NOT NULL;

-- 反馈按时间查询索引
CREATE INDEX IF NOT EXISTS "ai_feedback_createdAt_idx" ON "ai_feedback"("createdAt");
