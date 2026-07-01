-- CreateTable
CREATE TABLE "opinion_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "apiKeyEnc" TEXT NOT NULL DEFAULT '',
    "apiKeyMask" TEXT NOT NULL DEFAULT '',
    "baseUrl" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opinion_settings_pkey" PRIMARY KEY ("id")
);
