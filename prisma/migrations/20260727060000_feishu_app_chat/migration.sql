-- 阶段6 · 飞书双向对话:自建应用凭证(单例)+ 会话白名单
CREATE TABLE "feishu_app" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "appId" TEXT NOT NULL DEFAULT '',
    "appSecretEnc" TEXT NOT NULL DEFAULT '',
    "appSecretMask" TEXT NOT NULL DEFAULT '',
    "verificationTokenEnc" TEXT NOT NULL DEFAULT '',
    "encryptKeyEnc" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feishu_app_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "feishu_chat" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "chatType" TEXT NOT NULL DEFAULT 'group',
    "allowed" BOOLEAN NOT NULL DEFAULT false,
    "conversationId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feishu_chat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feishu_chat_chatId_key" ON "feishu_chat"("chatId");
