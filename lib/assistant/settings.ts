/**
 * 阶段10 · AI 助手 · 模型配置读写(按用途 usage 单例)。
 *
 * 泛化自 lib/opinion/settings.ts:apiKey 明文永不落 DB / 永不回前端,
 * 后端解密仅用于构造 provider 调模型(见 lib/assistant/model.ts)。
 */
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret, maskApiKey } from "@/lib/crypto";
import { AppError, badRequest } from "@/lib/errors";

export type ModelUsage = "chat" | "embedding";

export interface ModelProfilePublic {
  usage: ModelUsage;
  provider: string;
  model: string;
  baseUrl: string;
  apiKeyMask: string;
  updatedBy: string | null;
  updatedAt: Date | null;
  configured: boolean; // 未配置(apiKeyEnc 空)时 UI 对话入口禁用
}

/** 面向前端的安全视图,不含明文 apiKey。 */
export async function readPublicProfile(usage: ModelUsage): Promise<ModelProfilePublic> {
  const row = await prisma.aiModelProfile.findUnique({ where: { usage } });
  if (!row) {
    return {
      usage,
      provider: "",
      model: "",
      baseUrl: "",
      apiKeyMask: "",
      updatedBy: null,
      updatedAt: null,
      configured: false,
    };
  }
  return {
    usage,
    provider: row.provider,
    model: row.model,
    baseUrl: row.baseUrl,
    apiKeyMask: row.apiKeyMask,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
    configured: row.apiKeyEnc.length > 0,
  };
}

export interface ModelProfileInternal {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string; // 明文,仅服务端内部用
}

export async function readInternalProfile(usage: ModelUsage): Promise<ModelProfileInternal> {
  const row = await prisma.aiModelProfile.findUnique({ where: { usage } });
  if (!row || !row.apiKeyEnc) {
    throw badRequest(
      `AI 模型未配置(${usage}):请到「AI 助手 · 模型设置」填 provider / model / baseUrl / apiKey`,
    );
  }
  let apiKey: string;
  try {
    apiKey = decryptSecret(row.apiKeyEnc);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("INTERNAL", "解密 apiKey 失败", { cause: err });
  }
  return { provider: row.provider, model: row.model, baseUrl: row.baseUrl, apiKey };
}

export async function updateProfile(input: {
  usage: ModelUsage;
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  updatedBy: string;
}): Promise<ModelProfilePublic> {
  const enc = encryptSecret(input.apiKey);
  const mask = maskApiKey(input.apiKey);
  await prisma.aiModelProfile.upsert({
    where: { usage: input.usage },
    create: {
      usage: input.usage,
      provider: input.provider,
      model: input.model,
      baseUrl: input.baseUrl,
      apiKeyEnc: enc,
      apiKeyMask: mask,
      updatedBy: input.updatedBy,
    },
    update: {
      provider: input.provider,
      model: input.model,
      baseUrl: input.baseUrl,
      apiKeyEnc: enc,
      apiKeyMask: mask,
      updatedBy: input.updatedBy,
    },
  });
  return readPublicProfile(input.usage);
}
