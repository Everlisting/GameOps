/**
 * 飞书发送编排:日报 / 测试 / 群发,统一走审计。供 API / cron / AI 审批执行器复用。
 */
import { recordAudit, SYSTEM_ACTOR_USERNAME } from "@/lib/audit";
import { createLogger } from "@/lib/logger";
import { sendFeishu } from "@/lib/feishu/client";
import { textMessage, richCardMessage } from "@/lib/feishu/message";
import { buildDailyReportPayload } from "@/lib/feishu/report";
import { getDailyReportTargets, getWebhookTarget, type WebhookTarget } from "@/lib/feishu/config";

const log = createLogger("feishu.send");

export interface FeishuActor {
  id: string | null; // null = 系统(cron)
  username: string;
}

export const SYSTEM_FEISHU_ACTOR: FeishuActor = { id: null, username: SYSTEM_ACTOR_USERNAME };

/** 发送运营数据日报到指定群 + 审计 feishu.send。 */
export async function sendDailyReport(
  target: WebhookTarget,
  actor: FeishuActor,
): Promise<{ ok: boolean; msg: string }> {
  const payload = await buildDailyReportPayload();
  const r = await sendFeishu({ url: target.url, secret: target.secret }, payload);
  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "feishu.send",
    targetType: "feishu_webhook",
    targetId: target.id,
    details: { name: target.name, kind: "daily_report", ok: r.ok, code: r.code, msg: r.msg },
  });
  return { ok: r.ok, msg: r.msg };
}

/** 群发日报给所有 enabled && dailyReport 的群(cron / 手动一键)。 */
export async function sendDailyReportToAll(actor: FeishuActor): Promise<{ total: number; sent: number }> {
  const targets = await getDailyReportTargets();
  let sent = 0;
  for (const t of targets) {
    const r = await sendDailyReport(t, actor);
    if (r.ok) sent++;
  }
  return { total: targets.length, sent };
}

/** 发送一条自定义内容(标题 + lark_md 正文)到指定群 + 审计 feishu.send。 */
export async function sendCustomMessage(
  target: WebhookTarget,
  msg: { title?: string; content: string },
  actor: FeishuActor,
): Promise<{ ok: boolean; msg: string }> {
  const payload = richCardMessage(msg.title || "运营中台消息", msg.content, "blue");
  const r = await sendFeishu({ url: target.url, secret: target.secret }, payload);
  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "feishu.send",
    targetType: "feishu_webhook",
    targetId: target.id,
    details: { name: target.name, kind: "message", title: msg.title ?? null, ok: r.ok, code: r.code, msg: r.msg },
  });
  return { ok: r.ok, msg: r.msg };
}

/**
 * 把一段内容(如助手回复)投递到多个飞书群(用户在输入框显式选择的群)。
 * 逐群解密目标 + 发富卡片 + 审计;单群失败不影响其他群。永不抛(在 onFinish 后台调用)。
 */
export async function deliverToGroups(
  webhookIds: string[],
  content: string,
  actor: FeishuActor,
  title = "AI 助手回复",
): Promise<void> {
  for (const id of webhookIds) {
    try {
      const target = await getWebhookTarget(id);
      if (!target) continue;
      await sendCustomMessage(target, { title, content }, actor);
    } catch (err) {
      log.error("投递到群失败", { event: "feishu.deliver_failed", webhookId: id, err });
    }
  }
}

/** 发送连通性测试(纯文本)+ 审计 feishu.test。 */
export async function sendTestMessage(
  target: WebhookTarget,
  actor: FeishuActor,
): Promise<{ ok: boolean; msg: string }> {
  const r = await sendFeishu(
    { url: target.url, secret: target.secret },
    textMessage(`【测试】来自运营中台的飞书连通性测试 · ${new Date().toLocaleString("zh-CN")}`),
  );
  await recordAudit({
    actorId: actor.id,
    actorUsername: actor.username,
    action: "feishu.test",
    targetType: "feishu_webhook",
    targetId: target.id,
    details: { name: target.name, ok: r.ok, code: r.code, msg: r.msg },
  });
  return { ok: r.ok, msg: r.msg };
}
