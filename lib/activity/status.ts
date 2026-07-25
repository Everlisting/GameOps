/**
 * 活动状态变更的可复用逻辑,供状态 route 与「审批执行器」(阶段10.4)共用。
 * 允许转移:DRAFT → ONGOING(上线);ONGOING → ENDED(结束);ENDED 为终态。
 * 从原 route 抽出并补上审计 activity.status(关键动作走审计,见 CLAUDE.md)。
 */
import type { ActivityStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";

export const ALLOWED_STATUS_TRANSITIONS: Record<ActivityStatus, ActivityStatus[]> = {
  DRAFT: ["ONGOING"],
  ONGOING: ["ENDED"],
  ENDED: [],
};

export interface ActivityActor {
  id: string | null;
  username: string;
}

/** 校验转移是否合法并返回活动名 + 当前状态(供审批预览);不合法抛错,不写库。 */
export async function previewActivityStatus(
  activityId: string,
  target: ActivityStatus,
): Promise<{ activityName: string; currentStatus: ActivityStatus }> {
  const a = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { name: true, status: true },
  });
  if (!a) throw notFound("活动不存在");
  if (a.status !== target && !ALLOWED_STATUS_TRANSITIONS[a.status].includes(target)) {
    throw badRequest(`不允许从 ${a.status} 转到 ${target}`);
  }
  return { activityName: a.name, currentStatus: a.status };
}

/** 切换活动状态(状态机 + 审计)。幂等:已是目标状态直接返回,不写库。 */
export async function changeActivityStatus(
  activityId: string,
  target: ActivityStatus,
  actor: ActivityActor,
): Promise<{ fromStatus: ActivityStatus; toStatus: ActivityStatus; activityName: string }> {
  const a = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { name: true, status: true },
  });
  if (!a) throw notFound("活动不存在");
  if (a.status === target) {
    return { fromStatus: a.status, toStatus: target, activityName: a.name };
  }
  if (!ALLOWED_STATUS_TRANSITIONS[a.status].includes(target)) {
    throw badRequest(`不允许从 ${a.status} 转到 ${target}`);
  }

  await prisma.activity.update({ where: { id: activityId }, data: { status: target } });
  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "activity.status",
    targetType: "activity",
    targetId: activityId,
    details: { fromStatus: a.status, toStatus: target, activityName: a.name },
  });
  return { fromStatus: a.status, toStatus: target, activityName: a.name };
}
