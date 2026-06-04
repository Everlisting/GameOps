/**
 * Incentive 表的薄封装。
 *
 * 临时性目的:Prisma client 在 db:generate 真正跑成功之前,prisma.incentive
 * 类型在 IDE / tsc 里不可见。这里集中一次 cast,业务侧 import 这层就能拿到
 * 类型安全的 read/write API,避免每个 route 都散一份 (prisma as any).incentive。
 *
 * 重启 dev server 拿到新 client 后,删掉本文件、直接用 prisma.incentive 即可。
 */
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

/** Incentive 行的运行时 + 类型形状(对齐 schema.prisma) */
export type IncentiveRow = {
  id: string;
  creatorId: string;
  activityId: string;
  estimated: Prisma.Decimal;
  adjusted: Prisma.Decimal | null;
  adjustedById: string | null;
  adjustedAt: Date | null;
  adjustReason: string | null;
  breakdown: Prisma.JsonValue;
  computedAt: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type IncentiveDelegate = {
  findMany: (args: {
    where?: unknown;
    select?: unknown;
    orderBy?: unknown;
    take?: number;
    skip?: number;
  }) => Promise<IncentiveRow[]>;
  findUnique: (args: {
    where: { id?: string; creatorId_activityId?: { creatorId: string; activityId: string } };
    select?: unknown;
  }) => Promise<IncentiveRow | null>;
  upsert: (args: {
    where: { creatorId_activityId: { creatorId: string; activityId: string } };
    create: unknown;
    update: unknown;
    select?: unknown;
  }) => Promise<IncentiveRow>;
  update: (args: {
    where: { id: string };
    data: unknown;
    select?: unknown;
  }) => Promise<IncentiveRow>;
  count: (args: { where?: unknown }) => Promise<number>;
};

export const incentiveDb = (prisma as unknown as { incentive: IncentiveDelegate }).incentive;
