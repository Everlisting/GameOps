/**
 * 舆情监控 · 模型设置(ADMIN only)。
 * 单例配置:provider / model / apiKey / baseUrl。
 * apiKey 明文不回显,只显示 mask。
 */
import { requireRole } from "@/lib/rbac";
import { readPublicSettings } from "@/lib/opinion/settings";

import { OpinionSettingsForm } from "../_components/OpinionSettingsForm";

export default async function OperatorOpinionSettingsPage() {
  await requireRole("ADMIN");
  const s = await readPublicSettings();

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">舆情监控 · 模型设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          单例配置,供三种报告共用。ADMIN 才能修改;明文 apiKey 永远只在触发时临时解出,不入日志、不入审计明细。
        </p>
      </header>

      <OpinionSettingsForm
        current={{
          provider: s.provider,
          model: s.model,
          apiKeyMask: s.apiKeyMask,
          baseUrl: s.baseUrl,
          updatedBy: s.updatedBy,
          updatedAt: s.updatedAt ? s.updatedAt.toISOString() : null,
          configured: s.configured,
        }}
      />
    </div>
  );
}
