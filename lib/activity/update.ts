/**
 * 活动基础信息更新(带字段级 diff),供阶段10.4 审批执行器使用。
 * 仅覆盖自然语言可安全修改的字段:名称 / 简介 / 开始时间 / 结束时间。
 * 不含激励规则(rewardRules,结构化,须在中台规则编辑器改)、封面、定时发布。
 * 规则:ENDED 活动不可再改基础信息(与手动 PATCH 一致)。审计 activity.update(带 diff)。
 */
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";

export interface ActivityUpdateChanges {
  name?: string;
  description?: string;
  startAt?: string; // YYYY-MM-DD 或 ISO
  endAt?: string;
}
export interface ActivityActor {
  id: string | null;
  username: string;
}

export interface FieldDiff {
  field: string;
  label: string;
  from: string;
  to: string;
}

const FIELD_LABELS: Record<string, string> = {
  name: "名称",
  description: "简介",
  startAt: "开始时间",
  endAt: "结束时间",
};

function fmtDateTime(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** 载入活动并算出有效变更(只保留真正不同的字段);无变更 / ENDED 抛错。 */
async function loadAndDiff(activityId: string, changes: ActivityUpdateChanges) {
  const a = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { name: true, description: true, startAt: true, endAt: true, status: true },
  });
  if (!a) throw notFound("活动不存在");
  if (a.status === "ENDED") throw badRequest("活动已结束,不能再修改基础信息");

  const diffs: FieldDiff[] = [];
  const data: Record<string, unknown> = {};

  if (changes.name !== undefined && changes.name !== a.name) {
    diffs.push({ field: "name", label: FIELD_LABELS.name, from: a.name, to: changes.name });
    data.name = changes.name;
  }
  if (changes.description !== undefined && (changes.description ?? "") !== (a.description ?? "")) {
    diffs.push({
      field: "description",
      label: FIELD_LABELS.description,
      from: a.description ?? "—",
      to: changes.description || "—",
    });
    data.description = changes.description;
  }
  if (changes.startAt !== undefined) {
    const nd = new Date(changes.startAt);
    if (Number.isNaN(nd.getTime())) throw badRequest("开始时间格式不正确");
    if (a.startAt?.getTime() !== nd.getTime()) {
      diffs.push({ field: "startAt", label: FIELD_LABELS.startAt, from: fmtDateTime(a.startAt), to: fmtDateTime(nd) });
      data.startAt = nd;
    }
  }
  if (changes.endAt !== undefined) {
    const nd = new Date(changes.endAt);
    if (Number.isNaN(nd.getTime())) throw badRequest("结束时间格式不正确");
    if (a.endAt?.getTime() !== nd.getTime()) {
      diffs.push({ field: "endAt", label: FIELD_LABELS.endAt, from: fmtDateTime(a.endAt), to: fmtDateTime(nd) });
      data.endAt = nd;
    }
  }

  if (diffs.length === 0) throw badRequest("没有需要更新的字段(值与当前相同)");
  return { activity: a, diffs, data };
}

/** 预检并返回活动名 + 当前状态 + 逐字段 diff(供审批卡片展示);不合法抛错,不写库。 */
export async function previewActivityUpdate(
  activityId: string,
  changes: ActivityUpdateChanges,
): Promise<{ activityName: string; currentStatus: string; diffs: FieldDiff[] }> {
  const { activity, diffs } = await loadAndDiff(activityId, changes);
  return { activityName: activity.name, currentStatus: activity.status, diffs };
}

/** 应用更新 + 审计(带 diff)。执行时按当前值重新算 diff,避免应用陈旧值。 */
export async function updateActivity(
  activityId: string,
  changes: ActivityUpdateChanges,
  actor: ActivityActor,
): Promise<{ activityName: string; changed: string[] }> {
  const { activity, diffs, data } = await loadAndDiff(activityId, changes);
  await prisma.activity.update({ where: { id: activityId }, data });
  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "activity.update",
    targetType: "activity",
    targetId: activityId,
    details: {
      activityName: activity.name,
      diff: diffs.map((d) => ({ field: d.field, from: d.from, to: d.to })),
    },
  });
  return { activityName: activity.name, changed: diffs.map((d) => d.field) };
}
