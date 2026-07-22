/**
 * AI 助手 · 对话模型设置(仅 ADMIN)。
 * usage=chat 单例:provider / model / baseUrl / apiKey。apiKey 明文不回显,只显示 mask。
 */
import { requireRole } from "@/lib/rbac";
import { readPublicProfile } from "@/lib/assistant/settings";

import { ModelSettingsForm } from "../_components/ModelSettingsForm";

export default async function AssistantSettingsPage() {
  await requireRole("ADMIN");
  const p = await readPublicProfile("chat");

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">AI 助手 · 模型设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          对话模型走国产 OpenAI 兼容端点(数据不出境)。ADMIN 才能修改;明文 apiKey 加密入库,永不回显、不入日志。
        </p>
      </header>

      <ModelSettingsForm
        current={{
          provider: p.provider,
          model: p.model,
          baseUrl: p.baseUrl,
          apiKeyMask: p.apiKeyMask,
          updatedBy: p.updatedBy,
          updatedAt: p.updatedAt ? p.updatedAt.toISOString() : null,
          configured: p.configured,
        }}
      />
    </div>
  );
}
