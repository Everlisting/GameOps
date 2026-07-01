/**
 * 阶段9 · 舆情监控 · LLM 配置读写。
 *
 * 单例语义:表里只有一行 id=1。
 * apiKey 明文永不落 DB / 永不返回给前端 —— 前端拿到的是 mask,后端解密仅用于调分析服务。
 */
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret, maskApiKey } from "@/lib/crypto";
import { AppError, badRequest } from "@/lib/errors";

const SINGLETON_ID = 1;

export interface OpinionSettingsPublic {
  provider: "anthropic" | "openai" | "echo";
  model: string;
  apiKeyMask: string;
  baseUrl: string | null;
  updatedBy: string | null;
  updatedAt: Date | null;
  configured: boolean; // 未配置(apiKeyEnc 空)时 UI 触发按钮禁用
}

/** 面向前端的安全视图,不含明文 apiKey。 */
export async function readPublicSettings(): Promise<OpinionSettingsPublic> {
  const row = await prisma.opinionSettings.findUnique({ where: { id: SINGLETON_ID } });
  if (!row) {
    // seed 保证有单例;真出现异常态就返回未配置壳,让 UI 有可用状态
    return {
      provider: "echo",
      model: "echo",
      apiKeyMask: "",
      baseUrl: null,
      updatedBy: null,
      updatedAt: null,
      configured: false,
    };
  }
  return {
    provider: row.provider as OpinionSettingsPublic["provider"],
    model: row.model,
    apiKeyMask: row.apiKeyMask,
    baseUrl: row.baseUrl,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
    configured: row.apiKeyEnc.length > 0,
  };
}

/** 供触发流程内部用:返回明文 apiKey + provider/model/baseUrl,不返回给前端。 */
export interface OpinionSettingsInternal {
  provider: "anthropic" | "openai" | "echo";
  model: string;
  apiKey: string;
  baseUrl: string | null;
}

export async function readInternalSettings(): Promise<OpinionSettingsInternal> {
  const row = await prisma.opinionSettings.findUnique({ where: { id: SINGLETON_ID } });
  if (!row || !row.apiKeyEnc) {
    throw badRequest(
      "LLM 未配置:请到「舆情监控 · 模型设置」填一份可用的 provider / model / apiKey",
    );
  }
  let plain: string;
  try {
    plain = decryptSecret(row.apiKeyEnc);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("INTERNAL", "解密 apiKey 失败", { cause: err });
  }
  return {
    provider: row.provider as OpinionSettingsInternal["provider"],
    model: row.model,
    apiKey: plain,
    baseUrl: row.baseUrl,
  };
}

/** 更新 LLM 配置,同时加密 apiKey + 打码存 mask。 */
export async function updateSettings(input: {
  provider: "anthropic" | "openai" | "echo";
  model: string;
  apiKey: string;
  baseUrl: string | null;
  updatedBy: string;
}): Promise<OpinionSettingsPublic> {
  const enc = encryptSecret(input.apiKey);
  const mask = maskApiKey(input.apiKey);
  await prisma.opinionSettings.upsert({
    where: { id: SINGLETON_ID },
    create: {
      id: SINGLETON_ID,
      provider: input.provider,
      model: input.model,
      apiKeyEnc: enc,
      apiKeyMask: mask,
      baseUrl: input.baseUrl,
      updatedBy: input.updatedBy,
    },
    update: {
      provider: input.provider,
      model: input.model,
      apiKeyEnc: enc,
      apiKeyMask: mask,
      baseUrl: input.baseUrl,
      updatedBy: input.updatedBy,
    },
  });
  return readPublicSettings();
}
