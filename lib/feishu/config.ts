/**
 * 飞书 webhook 配置读写。URL / 加签密钥 AES 加密存库;对前端只回打码视图。
 */
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { feishuWebhookDb, type FeishuWebhookRow } from "@/lib/feishu/db";

/** 面向前端(不含 url / secret 明文)。 */
export interface WebhookView {
  id: string;
  name: string;
  urlMask: string;
  hasSecret: boolean;
  enabled: boolean;
  dailyReport: boolean;
  createdAt: string;
}

/** 内部发送用(解密后)。 */
export interface WebhookTarget {
  id: string;
  name: string;
  url: string;
  secret?: string;
}

function maskUrl(url: string): string {
  const m = url.match(/\/hook\/([^/?]+)/);
  if (!m) return url.length > 12 ? `${url.slice(0, 8)}…${url.slice(-4)}` : "****";
  const tok = m[1];
  const masked = tok.length <= 8 ? "****" : `${tok.slice(0, 4)}****${tok.slice(-4)}`;
  return url.replace(tok, masked);
}

function toView(r: FeishuWebhookRow): WebhookView {
  return {
    id: r.id,
    name: r.name,
    urlMask: r.urlMask,
    hasSecret: r.hasSecret,
    enabled: r.enabled,
    dailyReport: r.dailyReport,
    createdAt: r.createdAt.toISOString(),
  };
}

function toTarget(r: FeishuWebhookRow): WebhookTarget {
  return {
    id: r.id,
    name: r.name,
    url: decryptSecret(r.urlEnc),
    secret: r.secretEnc ? decryptSecret(r.secretEnc) : undefined,
  };
}

export async function listWebhooks(): Promise<WebhookView[]> {
  const rows = await feishuWebhookDb.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toView);
}

export async function createWebhook(
  input: { name: string; url: string; secret?: string; enabled?: boolean; dailyReport?: boolean },
  createdById: string | null,
): Promise<WebhookView> {
  const row = await feishuWebhookDb.create({
    data: {
      name: input.name,
      urlEnc: encryptSecret(input.url),
      urlMask: maskUrl(input.url),
      secretEnc: input.secret ? encryptSecret(input.secret) : "",
      hasSecret: !!input.secret,
      enabled: input.enabled ?? true,
      dailyReport: input.dailyReport ?? false,
      createdById,
    },
  });
  return toView(row);
}

export async function updateWebhook(
  id: string,
  input: { name?: string; url?: string; secret?: string; enabled?: boolean; dailyReport?: boolean },
): Promise<WebhookView> {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.url !== undefined) {
    data.urlEnc = encryptSecret(input.url);
    data.urlMask = maskUrl(input.url);
  }
  if (input.secret !== undefined) {
    data.secretEnc = input.secret ? encryptSecret(input.secret) : "";
    data.hasSecret = !!input.secret;
  }
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.dailyReport !== undefined) data.dailyReport = input.dailyReport;
  const row = await feishuWebhookDb.update({ where: { id }, data });
  return toView(row);
}

export async function deleteWebhook(id: string): Promise<void> {
  await feishuWebhookDb.delete({ where: { id } });
}

/** 取单个解密后的发送目标(不存在返回 null)。 */
export async function getWebhookTarget(id: string): Promise<WebhookTarget | null> {
  const r = await feishuWebhookDb.findUnique({ where: { id } });
  return r ? toTarget(r) : null;
}

/** 每日日报目标:enabled && dailyReport。 */
export async function getDailyReportTargets(): Promise<WebhookTarget[]> {
  const rows = await feishuWebhookDb.findMany({ where: { enabled: true, dailyReport: true } });
  return rows.map(toTarget);
}
