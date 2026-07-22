/**
 * 阶段10 · AI 助手 · 构造对话模型。
 *
 * 走国产模型的 OpenAI 兼容端点(数据不出境);apiKey 从加密配置解出。
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { readInternalProfile } from "@/lib/assistant/settings";

/** 读 chat 用途配置并构造 provider,返回 model + modelId(落审计/AiRun 用)。 */
export async function getChatModel() {
  const cfg = await readInternalProfile("chat");
  const provider = createOpenAICompatible({
    name: cfg.provider,
    baseURL: cfg.baseUrl,
    apiKey: cfg.apiKey,
  });
  return { model: provider(cfg.model), modelId: cfg.model };
}
