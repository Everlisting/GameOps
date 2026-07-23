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
  /** 重试时传入被重试的用户消息 id(其 parent):则新增一个助手版本而非新开一轮 */
  regenerateParentId: z.string().optional(),
});

/** POST /messages/activate 入参 */
export const activateSchema = z.object({
  messageId: z.string().min(1),
});

/** PATCH /conversations/[id] 入参(置顶 / 重命名,至少一项) */
export const conversationPatchSchema = z
  .object({
    pinned: z.boolean().optional(),
    title: z.string().trim().min(1, "标题不能为空").max(100, "标题过长").optional(),
  })
  .refine((v) => v.pinned !== undefined || v.title !== undefined, { message: "无更新字段" });

/** POST /feedback 入参 */
export const feedbackSchema = z.object({
  conversationId: z.string().optional(),
  clientMessageId: z.string().optional(),
  rating: z.enum(["up", "down"]),
  category: z.string().max(40).optional(),
  note: z.string().max(1000).optional(),
});
