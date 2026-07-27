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
