/**
 * AiApproval 的薄封装(cast 一次)。
 *
 * 与 lib/incentive/db.ts 同因:在 `prisma generate` 成功前,prisma.aiApproval
 * 在 tsc 里不可见。集中一次 cast,业务侧 import 这层拿到类型安全的 read/write。
 * 待 dev server 停下、generate 跑成功后可删本文件、直接用 prisma.aiApproval。
 */
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"
  | "failed";

export type ApprovalRow = {
  id: string;
  conversationId: string | null;
  runId: string | null;
  action: string;
  title: string;
  params: Prisma.JsonValue;
  preview: Prisma.JsonValue;
  status: ApprovalStatus;
  result: Prisma.JsonValue | null;
  errorMessage: string | null;
  createdById: string;
  createdByName: string;
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  executedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ApprovalDelegate = {
  create: (args: { data: unknown; select?: unknown }) => Promise<ApprovalRow>;
  findUnique: (args: { where: { id: string }; select?: unknown }) => Promise<ApprovalRow | null>;
  findMany: (args: {
    where?: unknown;
    orderBy?: unknown;
    take?: number;
    select?: unknown;
  }) => Promise<ApprovalRow[]>;
  update: (args: { where: { id: string }; data: unknown; select?: unknown }) => Promise<ApprovalRow>;
  updateMany: (args: { where: unknown; data: unknown }) => Promise<{ count: number }>;
  count: (args: { where?: unknown }) => Promise<number>;
};

export const approvalDb = (prisma as unknown as { aiApproval: ApprovalDelegate }).aiApproval;

/** 面向前端的审批视图(时间转 ISO;params 不外露,仅 preview/result)。 */
export interface ApprovalView {
  id: string;
  action: string;
  title: string;
  preview: Prisma.JsonValue;
  status: ApprovalStatus;
  result: Prisma.JsonValue | null;
  errorMessage: string | null;
  createdByName: string;
  createdAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  executedAt: string | null;
  conversationId: string | null;
}

export function serializeApproval(r: ApprovalRow): ApprovalView {
  return {
    id: r.id,
    action: r.action,
    title: r.title,
    preview: r.preview,
    status: r.status,
    result: r.result,
    errorMessage: r.errorMessage,
    createdByName: r.createdByName,
    createdAt: r.createdAt.toISOString(),
    decidedByName: r.decidedByName,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    executedAt: r.executedAt ? r.executedAt.toISOString() : null,
    conversationId: r.conversationId,
  };
}
