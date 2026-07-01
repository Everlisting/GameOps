/**
 * GET /api/opinion/settings — 读 LLM 全局配置(ADMIN)
 * PUT /api/opinion/settings — 更新 LLM 配置(ADMIN)
 *
 * 明文 apiKey 永不返回;GET 只回 apiKeyMask + configured 标志。
 * PUT 后写审计 opinion.settings.update,details 里落 mask 而非明文。
 */
import type { Prisma } from "@prisma/client";

import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { settingsUpdateSchema } from "@/lib/validation/opinion";
import { readPublicSettings, updateSettings } from "@/lib/opinion/settings";
import { maskApiKey } from "@/lib/crypto";

export const GET = route(async () => {
  await requireRole("ADMIN");
  const s = await readPublicSettings();
  return Response.json(s);
});

export const PUT = route(async (req) => {
  const session = await requireRole("ADMIN");
  const input = await parseJson(req, settingsUpdateSchema);

  const before = await readPublicSettings();
  const after = await updateSettings({
    provider: input.provider,
    model: input.model,
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    updatedBy: session.username,
  });

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "opinion.settings.update",
    targetType: "opinion_settings",
    targetId: "1",
    details: {
      before: {
        provider: before.provider,
        model: before.model,
        apiKeyMask: before.apiKeyMask,
        baseUrl: before.baseUrl,
      },
      after: {
        provider: after.provider,
        model: after.model,
        apiKeyMask: maskApiKey(input.apiKey),
        baseUrl: after.baseUrl,
      },
    } as Prisma.InputJsonValue,
  });

  return Response.json(after);
});
