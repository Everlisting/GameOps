/**
 * 飞书自建应用:凭证读写(AES 加密)+ tenant_access_token 获取与缓存。
 */
import { encryptSecret, decryptSecret, maskApiKey } from "@/lib/crypto";
import { feishuAppDb } from "@/lib/feishu/db";
import { logExternalResult } from "@/lib/logger/external";

export const FEISHU_BASE = "https://open.feishu.cn";

export interface FeishuAppConfig {
  appId: string;
  appSecret: string;
  verificationToken: string;
  encryptKey: string; // 空=事件不加密
  enabled: boolean;
}

export interface FeishuAppPatch {
  appId?: string;
  appSecret?: string;
  verificationToken?: string;
  encryptKey?: string;
  enabled?: boolean;
}

/** 面向前端(不含明文密钥)。 */
export interface FeishuAppView {
  appId: string;
  appSecretMask: string;
  hasVerificationToken: boolean;
  hasEncryptKey: boolean;
  enabled: boolean;
  configured: boolean;
}

/** 取解密后的完整配置;未配置(无 appId/secret)返回 null。 */
export async function getFeishuAppConfig(): Promise<FeishuAppConfig | null> {
  const row = await feishuAppDb.findUnique({ where: { id: 1 } });
  if (!row || !row.appId || !row.appSecretEnc) return null;
  return {
    appId: row.appId,
    appSecret: decryptSecret(row.appSecretEnc),
    verificationToken: row.verificationTokenEnc ? decryptSecret(row.verificationTokenEnc) : "",
    encryptKey: row.encryptKeyEnc ? decryptSecret(row.encryptKeyEnc) : "",
    enabled: row.enabled,
  };
}

export async function getFeishuAppView(): Promise<FeishuAppView> {
  const row = await feishuAppDb.findUnique({ where: { id: 1 } });
  return {
    appId: row?.appId ?? "",
    appSecretMask: row?.appSecretMask ?? "",
    hasVerificationToken: !!row?.verificationTokenEnc,
    hasEncryptKey: !!row?.encryptKeyEnc,
    enabled: row?.enabled ?? false,
    configured: !!(row?.appId && row?.appSecretEnc),
  };
}

/**
 * 合并部分更新得到即将生效的完整配置,但不写库。
 * 用于先验证新长连接,验证成功后再持久化,避免错误凭证覆盖可用配置。
 */
export async function previewFeishuAppConfig(input: FeishuAppPatch): Promise<FeishuAppConfig> {
  const row = await feishuAppDb.findUnique({ where: { id: 1 } });
  return {
    appId: input.appId !== undefined ? input.appId.trim() : (row?.appId ?? ""),
    appSecret: input.appSecret
      ? input.appSecret
      : row?.appSecretEnc
        ? decryptSecret(row.appSecretEnc)
        : "",
    verificationToken:
      input.verificationToken !== undefined
        ? input.verificationToken
        : row?.verificationTokenEnc
          ? decryptSecret(row.verificationTokenEnc)
          : "",
    encryptKey:
      input.encryptKey !== undefined
        ? input.encryptKey
        : row?.encryptKeyEnc
          ? decryptSecret(row.encryptKeyEnc)
          : "",
    enabled: input.enabled ?? row?.enabled ?? false,
  };
}

/** 保存配置(部分更新;密钥类字段仅在传入非空时覆盖)。 */
export async function saveFeishuAppConfig(
  input: FeishuAppPatch,
  updatedBy: string,
): Promise<void> {
  const data: Record<string, unknown> = { updatedBy };
  if (input.appId !== undefined) data.appId = input.appId.trim();
  if (input.appSecret) {
    data.appSecretEnc = encryptSecret(input.appSecret);
    data.appSecretMask = maskApiKey(input.appSecret);
  }
  if (input.verificationToken !== undefined) {
    data.verificationTokenEnc = input.verificationToken ? encryptSecret(input.verificationToken) : "";
  }
  if (input.encryptKey !== undefined) {
    data.encryptKeyEnc = input.encryptKey ? encryptSecret(input.encryptKey) : "";
  }
  if (input.enabled !== undefined) data.enabled = input.enabled;

  await feishuAppDb.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });
  clearFeishuTokenCache();
}

// ── tenant_access_token(内存缓存,提前 5 分钟过期)──────────────────────
let tokenCache: { token: string; expireAt: number } | null = null;
let botOpenIdCache: string | null = null;

/** 凭证变化后强制下一次 OpenAPI 调用获取新 token(并失效机器人身份缓存)。 */
export function clearFeishuTokenCache(): void {
  tokenCache = null;
  botOpenIdCache = null;
}

/**
 * 取机器人自身的 open_id(用于判断群消息是否 @了机器人本人)。缓存于内存;失败返回 "".
 * GET /open-apis/bot/v3/info → { bot: { open_id } }。
 */
export async function getBotOpenId(): Promise<string> {
  if (botOpenIdCache) return botOpenIdCache;
  try {
    const token = await getTenantAccessToken();
    const res = await fetch(`${FEISHU_BASE}/open-apis/bot/v3/info`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => ({}))) as {
      code?: number;
      bot?: { open_id?: string };
    };
    const openId = data.code === 0 ? data.bot?.open_id ?? "" : "";
    if (openId) botOpenIdCache = openId;
    else logExternalResult("feishu", "bot.info", { ok: false, code: data.code, detail: "取 bot open_id 失败" });
    return openId;
  } catch (err) {
    logExternalResult("feishu", "bot.info", { ok: false, code: -1, detail: err instanceof Error ? err.message : "网络错误" });
    return "";
  }
}

export async function getTenantAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expireAt) return tokenCache.token;
  const cfg = await getFeishuAppConfig();
  if (!cfg) throw new Error("飞书应用未配置");

  const res = await fetch(`${FEISHU_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    code?: number;
    msg?: string;
    tenant_access_token?: string;
    expire?: number;
  };
  if (data.code !== 0 || !data.tenant_access_token) {
    logExternalResult("feishu", "auth.tenant_token", { ok: false, code: data.code ?? res.status, detail: data.msg });
    throw new Error(`获取 tenant_access_token 失败:${data.msg ?? `HTTP ${res.status}`}`);
  }
  const ttlMs = Math.max((data.expire ?? 7200) - 300, 60) * 1000;
  tokenCache = { token: data.tenant_access_token, expireAt: Date.now() + ttlMs };
  return tokenCache.token;
}
