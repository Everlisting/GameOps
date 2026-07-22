/**
 * 阶段10 · AI 助手 · 入参校验。
 */
import { z } from "zod";

/** 模型用途:chat(对话)/ embedding(知识库嵌入,10.3 用) */
export const modelUsageSchema = z.enum(["chat", "embedding"]);

/** 更新模型配置(ADMIN)。apiKey 明文只在此提交一次,加密入库。 */
export const modelProfileUpdateSchema = z.object({
  provider: z.string().min(1, "provider 不能为空"),
  model: z.string().min(1, "model 不能为空"),
  baseUrl: z.string().url("baseUrl 需为合法 URL(OpenAI 兼容端点)"),
  apiKey: z.string().min(1, "apiKey 不能为空"),
});

/** 一条 UI 消息(宽松结构,交给 convertToModelMessages 收窄) */
const uiMessageSchema = z
  .object({
    id: z.string().optional(),
    role: z.enum(["system", "user", "assistant"]),
    parts: z.array(z.unknown()).optional(),
    content: z.unknown().optional(),
  })
  .passthrough();

/** POST /chat 入参 */
export const chatInputSchema = z.object({
  conversationId: z.string().optional(),
  messages: z.array(uiMessageSchema).min(1, "messages 不能为空"),
});
