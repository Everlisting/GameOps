/**
 * 操作审计日志:trigger / cancel / rerun / 模板修改 等关键动作写一条。
 *
 * 设计原则:
 *   - 失败不阻塞主路径:网络 / DB 瞬错只 console.error,不抛
 *   - 写入用 actorUsername 快照,User 被删后审计仍可读
 *   - cron 自动触发用 SYSTEM_ACTOR(actorId=null, actorUsername="<system>")
 */
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export const SYSTEM_ACTOR_USERNAME = "<system>";

export type AuditAction =
  | "task.trigger"
  | "task.cancel"
  | "task.requeue"
  | "task.rerun"
  | "task.delete"
  | "task.priority"
  | "job.create"
  | "job.update"
  | "job.delete"
  | "job.toggle"
  | "agent.create"
  | "agent.update"
  | "agent.delete"
  | "agent.rotateToken"
  // 阶段5 · 激励引擎
  | "incentive.compute"   // 全活动重算预估
  | "incentive.adjust";   // 单条人工调整

export type AuditTargetType =
  | "task"
  | "job"
  | "agent"
  | "dataset"
  | "user"
  | "activity"   // 阶段5 · compute 落到 activity
  | "incentive"; // 阶段5 · adjust 落到 incentive

export interface AuditOpts {
  /** 操作人 user.id;null = 系统(cron 自动触发) */
  actorId: string | null;
  /** 写入时快照的用户名 */
  actorUsername: string;
  action: AuditAction | string;
  targetType: AuditTargetType | string;
  targetId?: string | null;
  /** 富信息:paramValues / fromStatus→toStatus / 字段 diff 等 */
  details?: Prisma.InputJsonValue;
}

/** 写一条审计。永不抛 —— 主路径错误不应该被审计写入失败带挂。 */
export async function recordAudit(opts: AuditOpts): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: opts.actorId,
        actorUsername: opts.actorUsername,
        action: opts.action,
        targetType: opts.targetType,
        targetId: opts.targetId ?? null,
        details: opts.details,
      },
    });
  } catch (err) {
    console.error("[audit] record failed", { opts, err });
  }
}
