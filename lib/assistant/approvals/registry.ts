/**
 * 阶段10.4 · 需审批的写操作 · 执行器注册表。
 *
 * 一个 action 对应一个 handler:
 *   - buildProposal:把工具原始入参 → 校验 + 轻量预检 + 生成人类可读提案(title/preview/params)。
 *     失败直接抛错,写工具据此告知模型「无法生成提案」,不落 AiApproval。
 *   - execute:运营批准后幂等执行,复用现有业务逻辑,返回结果摘要。
 *
 * 新增写动作 = 在此加一个 handler + 在 tools/schemas.ts 加工具定义 + tools/index.ts 挂载。
 */
import type { Role } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/errors";
import {
  previewActivityCompute,
  computeActivityIncentives,
} from "@/lib/incentive/compute";
import { cancelCrawlerTask, rerunCrawlerTask } from "@/lib/crawler/task-ops";
import { changeActivityStatus, previewActivityStatus } from "@/lib/activity/status";
import { previewActivityUpdate, updateActivity } from "@/lib/activity/update";
import { listWebhooks, getWebhookTarget } from "@/lib/feishu/config";
import { sendDailyReport, sendCustomMessage } from "@/lib/feishu/send";

export interface ApprovalActor {
  id: string;
  username: string;
}

export interface ProposalDraft {
  title: string;
  preview: Record<string, unknown>;
  params: Record<string, unknown>;
}

export interface ApprovalHandler {
  action: string;
  /** 审批人所需最小角色(requireRole 会按层级放行 ADMIN)。 */
  requiredRole: Role;
  /** 校验 + 预检 + 生成提案;失败抛错(不落审批)。 */
  buildProposal(rawInput: unknown): Promise<ProposalDraft>;
  /** 批准后幂等执行,返回结果摘要(存入 AiApproval.result)。 */
  execute(params: unknown, actor: ApprovalActor): Promise<Record<string, unknown>>;
}

// ── incentive.compute:全活动重算预估激励 ──────────────────────────────
const incentiveComputeInput = z.object({
  activityId: z.string().min(1, "需要活动 id"),
});

const incentiveComputeHandler: ApprovalHandler = {
  action: "incentive.compute",
  requiredRole: "OPERATOR",
  async buildProposal(raw) {
    const { activityId } = incentiveComputeInput.parse(raw);
    const { activityName, rulesCount, submissionsCount, candidateCount } =
      await previewActivityCompute(activityId);
    return {
      title: `重算活动《${activityName}》的预估激励`,
      preview: {
        activityId,
        activityName,
        rulesCount,
        submissionsCount,
        candidateCount,
        scope: "候选=报名∪投稿;人工调整(adjusted)保留不动",
        effect: "覆盖每位候选创作者的预估激励金额、明细和计算时间",
      },
      params: { activityId },
    };
  },
  async execute(params, actor) {
    const { activityId } = incentiveComputeInput.parse(params);
    const summary = await computeActivityIncentives(activityId, {
      id: actor.id,
      username: actor.username,
    });
    return { ...summary };
  },
};

// ── crawler.task_rerun / crawler.task_cancel:采集任务重跑 / 取消 ──────────
const crawlerTaskInput = z.object({ taskId: z.string().min(1, "需要任务 id") });

const crawlerRerunHandler: ApprovalHandler = {
  action: "crawler.task_rerun",
  requiredRole: "OPERATOR",
  async buildProposal(raw) {
    const { taskId } = crawlerTaskInput.parse(raw);
    const t = await prisma.crawlerTask.findUnique({
      where: { id: taskId },
      select: { status: true, sequenceNumber: true, jobId: true, job: { select: { name: true } } },
    });
    if (!t) throw notFound("任务不存在");
    if (!t.jobId) throw conflict("该任务没有关联 Job(历史数据),不支持重跑");
    return {
      title: `重跑采集任务 #${t.sequenceNumber}(${t.job?.name ?? "未知 Job"})`,
      preview: {
        taskId,
        jobName: t.job?.name ?? "未知 Job",
        sequenceNumber: t.sequenceNumber,
        sourceStatus: t.status,
        effect: "基于原任务的 Job + 参数克隆一条新 PENDING 任务,原任务不动",
      },
      params: { taskId },
    };
  },
  async execute(params, actor) {
    const { taskId } = crawlerTaskInput.parse(params);
    const r = await rerunCrawlerTask(taskId, { id: actor.id, username: actor.username });
    return { message: "已克隆新任务", newTaskId: r.newTaskId, jobId: r.jobId };
  },
};

const crawlerCancelHandler: ApprovalHandler = {
  action: "crawler.task_cancel",
  requiredRole: "OPERATOR",
  async buildProposal(raw) {
    const { taskId } = crawlerTaskInput.parse(raw);
    const t = await prisma.crawlerTask.findUnique({
      where: { id: taskId },
      select: { status: true, sequenceNumber: true, job: { select: { name: true } } },
    });
    if (!t) throw notFound("任务不存在");
    if (t.status === "SUCCEEDED") throw conflict("已完成任务不能取消");
    if (t.status === "CANCELED") throw conflict("任务已取消");
    return {
      title: `取消采集任务 #${t.sequenceNumber}(${t.job?.name ?? "未知 Job"})`,
      preview: {
        taskId,
        jobName: t.job?.name ?? "未知 Job",
        sequenceNumber: t.sequenceNumber,
        currentStatus: t.status,
        effect: t.status === "RUNNING" ? "置为已取消,Agent 数秒内 kill 子进程" : "置为已取消",
      },
      params: { taskId },
    };
  },
  async execute(params, actor) {
    const { taskId } = crawlerTaskInput.parse(params);
    const r = await cancelCrawlerTask(taskId, { id: actor.id, username: actor.username });
    return { message: "任务已取消", fromStatus: r.fromStatus };
  },
};

// ── activity.status:活动上线 / 结束 ──────────────────────────────────
const activityStatusInput = z.object({
  activityId: z.string().min(1, "需要活动 id"),
  status: z.enum(["ONGOING", "ENDED"]),
});

const activityStatusHandler: ApprovalHandler = {
  action: "activity.status",
  requiredRole: "OPERATOR",
  async buildProposal(raw) {
    const { activityId, status } = activityStatusInput.parse(raw);
    const { activityName, currentStatus } = await previewActivityStatus(activityId, status);
    const verb = status === "ONGOING" ? "上线" : "结束";
    return {
      title: `${verb}活动《${activityName}》`,
      preview: {
        activityId,
        activityName,
        currentStatus,
        targetStatus: status,
        effect:
          status === "ONGOING"
            ? "活动转为进行中,创作者端可见并可报名/投稿"
            : "活动转为已结束(终态),不可再变更",
      },
      params: { activityId, status },
    };
  },
  async execute(params, actor) {
    const { activityId, status } = activityStatusInput.parse(params);
    const r = await changeActivityStatus(activityId, status, { id: actor.id, username: actor.username });
    return {
      message: `活动已${status === "ONGOING" ? "上线" : "结束"}`,
      activityName: r.activityName,
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
    };
  },
};

// ── activity.update:改活动基础信息(名称/简介/起止时间),ADMIN 审批,带字段 diff ──
const activityUpdateInput = z
  .object({
    activityId: z.string().min(1, "需要活动 id"),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    startAt: z.string().optional(),
    endAt: z.string().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.description !== undefined ||
      v.startAt !== undefined ||
      v.endAt !== undefined,
    { message: "至少要修改一个字段" },
  );

const activityUpdateHandler: ApprovalHandler = {
  action: "activity.update",
  requiredRole: "ADMIN",
  async buildProposal(raw) {
    const p = activityUpdateInput.parse(raw);
    const { activityName, currentStatus, diffs } = await previewActivityUpdate(p.activityId, p);
    // 逐字段 diff 直接铺进 preview(卡片按 "字段:旧 → 新" 出行)
    const preview: Record<string, unknown> = { activityName, currentStatus };
    for (const d of diffs) preview[d.label] = `${d.from} → ${d.to}`;
    preview.effect = "管理员批准后立即生效";
    return {
      title: `修改活动《${activityName}》的基础信息`,
      preview,
      params: {
        activityId: p.activityId,
        name: p.name,
        description: p.description,
        startAt: p.startAt,
        endAt: p.endAt,
      },
    };
  },
  async execute(params, actor) {
    const p = activityUpdateInput.parse(params);
    const r = await updateActivity(p.activityId, p, { id: actor.id, username: actor.username });
    return { message: "活动已更新", activityName: r.activityName, changed: r.changed.join("、") };
  },
};

// ── feishu.send_report:把运营数据日报推送到飞书群 ──────────────────────
const feishuSendReportInput = z.object({
  group: z.string().optional(), // 飞书群名称(模糊);缺省=唯一启用的群
});

/** 解析目标群:按名称模糊匹配启用中的群;不给名称且仅一个启用群时用它;否则报错。 */
async function resolveFeishuTarget(group?: string): Promise<{ id: string; name: string }> {
  const enabled = (await listWebhooks()).filter((w) => w.enabled);
  if (enabled.length === 0) throw badRequest("尚未配置启用中的飞书群(请先在中台配置)");
  if (group) {
    const hit = enabled.find((w) => w.name.includes(group)) ?? enabled.find((w) => group.includes(w.name));
    if (!hit) throw badRequest(`没有找到名为「${group}」的飞书群`);
    return { id: hit.id, name: hit.name };
  }
  if (enabled.length > 1) {
    throw badRequest(`有多个飞书群(${enabled.map((w) => w.name).join("、")}),请指明发到哪个`);
  }
  return { id: enabled[0].id, name: enabled[0].name };
}

const feishuSendReportHandler: ApprovalHandler = {
  action: "feishu.send_report",
  requiredRole: "OPERATOR",
  async buildProposal(raw) {
    const { group } = feishuSendReportInput.parse(raw);
    const target = await resolveFeishuTarget(group);
    return {
      title: `向飞书群「${target.name}」发送运营数据日报`,
      preview: {
        群: target.name,
        内容: "运营数据日报(本月视频总量 / Top5 作品 / 进行中活动)",
        effect: "批准后立即推送到该飞书群",
      },
      params: { webhookId: target.id, webhookName: target.name },
    };
  },
  async execute(params, actor) {
    const p = z.object({ webhookId: z.string(), webhookName: z.string() }).parse(params);
    const target = await getWebhookTarget(p.webhookId);
    if (!target) throw badRequest("飞书群不存在或已删除");
    const r = await sendDailyReport(target, { id: actor.id, username: actor.username });
    if (!r.ok) throw badRequest(`飞书发送失败:${r.msg}`);
    return { message: "日报已发送", 群: p.webhookName };
  },
};

// ── feishu.send_message:把指定内容(如助手生成的分析)推送到飞书群 ────────
const feishuSendMessageInput = z.object({
  group: z.string().optional(),
  title: z.string().optional(),
  content: z.string().min(1, "内容不能为空"),
});

const feishuSendMessageHandler: ApprovalHandler = {
  action: "feishu.send_message",
  requiredRole: "OPERATOR",
  async buildProposal(raw) {
    const p = feishuSendMessageInput.parse(raw);
    const target = await resolveFeishuTarget(p.group);
    const snippet = p.content.length > 120 ? `${p.content.slice(0, 120)}…` : p.content;
    return {
      title: `向飞书群「${target.name}」发送消息`,
      preview: {
        群: target.name,
        标题: p.title ?? "(默认)",
        内容预览: snippet,
        effect: "批准后立即推送到该飞书群",
      },
      params: { webhookId: target.id, webhookName: target.name, title: p.title, content: p.content },
    };
  },
  async execute(params, actor) {
    const p = z
      .object({
        webhookId: z.string(),
        webhookName: z.string(),
        title: z.string().optional(),
        content: z.string(),
      })
      .parse(params);
    const target = await getWebhookTarget(p.webhookId);
    if (!target) throw badRequest("飞书群不存在或已删除");
    const r = await sendCustomMessage(
      target,
      { title: p.title, content: p.content },
      { id: actor.id, username: actor.username },
    );
    if (!r.ok) throw badRequest(`飞书发送失败:${r.msg}`);
    return { message: "消息已发送", 群: p.webhookName };
  },
};

export const APPROVAL_HANDLERS: Record<string, ApprovalHandler> = {
  [incentiveComputeHandler.action]: incentiveComputeHandler,
  [crawlerRerunHandler.action]: crawlerRerunHandler,
  [crawlerCancelHandler.action]: crawlerCancelHandler,
  [activityStatusHandler.action]: activityStatusHandler,
  [activityUpdateHandler.action]: activityUpdateHandler,
  [feishuSendReportHandler.action]: feishuSendReportHandler,
  [feishuSendMessageHandler.action]: feishuSendMessageHandler,
};

export function getApprovalHandler(action: string): ApprovalHandler | undefined {
  return APPROVAL_HANDLERS[action];
}
