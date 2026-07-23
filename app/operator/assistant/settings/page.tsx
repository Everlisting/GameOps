/**
 * AI 助手 · 模型设置(仅 ADMIN)。
 * chat:对话模型;embedding:知识库嵌入模型(10.3,维度须 1024)。均走国产 OpenAI 兼容端点。
 */
import { requireRole } from "@/lib/rbac";
import { readPublicProfile } from "@/lib/assistant/settings";

import { ModelSettingsForm } from "../_components/ModelSettingsForm";

export default async function AssistantSettingsPage() {
  await requireRole("ADMIN");
  const chat = await readPublicProfile("chat");
  const embedding = await readPublicProfile("embedding");

  const toProps = (p: Awaited<ReturnType<typeof readPublicProfile>>) => ({
    provider: p.provider,
    model: p.model,
    baseUrl: p.baseUrl,
    apiKeyMask: p.apiKeyMask,
    updatedBy: p.updatedBy,
    updatedAt: p.updatedAt ? p.updatedAt.toISOString() : null,
    configured: p.configured,
  });

  return (
    <div className="space-y-8 p-8">
      <section>
        <header className="mb-4">
          <h1 className="text-lg font-semibold">AI 助手 · 模型设置</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            对话模型 + 知识库嵌入模型,均走国产 OpenAI 兼容端点(数据不出境)。ADMIN 才能修改;明文 apiKey 加密入库,永不回显、不入日志。
          </p>
        </header>
        <h2 className="mb-2 text-sm font-medium">对话模型(chat)</h2>
        <ModelSettingsForm usage="chat" current={toProps(chat)} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">
          知识库嵌入模型(embedding)· 输出维度须为 1024
        </h2>
        <ModelSettingsForm usage="embedding" current={toProps(embedding)} />
      </section>
    </div>
  );
}
