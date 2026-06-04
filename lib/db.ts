/**
 * Prisma client 单例。避免 Next.js 开发热重载产生多连接。
 * 全项目只从这里导入 prisma。
 */
import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/validation/env";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
