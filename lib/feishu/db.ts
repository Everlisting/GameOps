/**
 * FeishuWebhook 的薄封装(cast 一次)。
 * 同 incentiveDb/approvalDb 惯例:generate 成功前 prisma.feishuWebhook 在 tsc 不可见。
 * dev 停下、generate 后可删本文件、直接用 prisma.feishuWebhook。
 */
import { prisma } from "@/lib/db";

export type FeishuWebhookRow = {
  id: string;
  name: string;
  urlEnc: string;
  urlMask: string;
  secretEnc: string;
  hasSecret: boolean;
  enabled: boolean;
  dailyReport: boolean;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type FeishuWebhookDelegate = {
  findMany: (args?: { where?: unknown; orderBy?: unknown; select?: unknown }) => Promise<FeishuWebhookRow[]>;
  findUnique: (args: { where: { id: string }; select?: unknown }) => Promise<FeishuWebhookRow | null>;
  create: (args: { data: unknown; select?: unknown }) => Promise<FeishuWebhookRow>;
  update: (args: { where: { id: string }; data: unknown; select?: unknown }) => Promise<FeishuWebhookRow>;
  delete: (args: { where: { id: string } }) => Promise<FeishuWebhookRow>;
  count: (args?: { where?: unknown }) => Promise<number>;
};

export const feishuWebhookDb = (prisma as unknown as { feishuWebhook: FeishuWebhookDelegate })
  .feishuWebhook;

// ── FeishuApp(自建应用凭证,单例)──────────────────────────────────────
export type FeishuAppRow = {
  id: number;
  appId: string;
  appSecretEnc: string;
  appSecretMask: string;
  verificationTokenEnc: string;
  encryptKeyEnc: string;
  enabled: boolean;
  updatedBy: string | null;
  updatedAt: Date;
  createdAt: Date;
};

type FeishuAppDelegate = {
  findUnique: (args: { where: { id: number } }) => Promise<FeishuAppRow | null>;
  upsert: (args: { where: { id: number }; create: unknown; update: unknown }) => Promise<FeishuAppRow>;
};

export const feishuAppDb = (prisma as unknown as { feishuApp: FeishuAppDelegate }).feishuApp;

// ── FeishuChat(会话白名单)────────────────────────────────────────────
export type FeishuChatRow = {
  id: string;
  chatId: string;
  name: string;
  chatType: string;
  allowed: boolean;
  conversationId: string | null;
  lastSeenAt: Date;
  createdAt: Date;
};

type FeishuChatDelegate = {
  findUnique: (args: { where: { chatId: string } | { id: string } }) => Promise<FeishuChatRow | null>;
  findMany: (args?: { where?: unknown; orderBy?: unknown }) => Promise<FeishuChatRow[]>;
  upsert: (args: { where: { chatId: string }; create: unknown; update: unknown }) => Promise<FeishuChatRow>;
  update: (args: { where: { id: string } | { chatId: string }; data: unknown }) => Promise<FeishuChatRow>;
  delete: (args: { where: { id: string } }) => Promise<FeishuChatRow>;
};

export const feishuChatDb = (prisma as unknown as { feishuChat: FeishuChatDelegate }).feishuChat;
