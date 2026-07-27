/**
 * 飞书发送编排:日报 / 测试 / 群发,统一走审计。供 API / cron / AI 审批执行器复用。
 */
import { recordAudit, SYSTEM_ACTOR_USERNAME } from "@/lib/audit";
import { sendFeishu } from "@/lib/feishu/client";
import { textMessage, richCardMessage } from "@/lib/feishu/message";
import { buildDailyReportPayload } from "@/lib/feishu/report";
import { getDailyReportTargets, type WebhookTarget } from "@/lib/feishu/config";

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
