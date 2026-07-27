-- 阶段6 · 飞书外发:群自定义机器人 webhook(多群),URL/加签密钥 AES 加密存库
CREATE TABLE "feishu_webhook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "urlEnc" TEXT NOT NULL,
    "urlMask" TEXT NOT NULL DEFAULT '',
    "secretEnc" TEXT NOT NULL DEFAULT '',
    "hasSecret" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyReport" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feishu_webhook_pkey" PRIMARY KEY ("id")
);
