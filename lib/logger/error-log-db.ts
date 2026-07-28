/**
 * ErrorLog 的薄封装(cast 一次)。
 * 同 approvalDb/feishuWebhookDb 惯例:`prisma generate` 成功前 prisma.errorLog 在 tsc 不可见。
 * dev 停下、generate 后可删本文件、直接用 prisma.errorLog。
 */
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export type ErrorLogRow = {
  id: string;
  occurredAt: Date;
  ingestedAt: Date;
  level: string;
  service: string;
  environment: string;
  release: string | null;
  instanceId: string | null;
  module: string;
  event: string | null;
  msg: string;
  requestId: string | null;
  traceId: string | null;
  taskId: string | null;
  runId: string | null;
  userIdHash: string | null;
  errName: string | null;
  errMessage: string | null;
  errStack: string | null;
  errCode: string | null;
  fingerprint: string;
  fields: Prisma.JsonValue | null;
};

type ErrorLogDelegate = {
  createMany: (args: { data: unknown[] }) => Promise<{ count: number }>;
  findMany: (args?: {
    where?: unknown;
    orderBy?: unknown;
    skip?: number;
    take?: number;
    select?: unknown;
  }) => Promise<ErrorLogRow[]>;
  count: (args?: { where?: unknown }) => Promise<number>;
  deleteMany: (args: { where?: unknown }) => Promise<{ count: number }>;
};

export const errorLogDb = (prisma as unknown as { errorLog: ErrorLogDelegate }).errorLog;
