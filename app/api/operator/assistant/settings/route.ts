/**
 * GET /api/operator/assistant/settings?usage=chat — 读模型配置(ADMIN)
 * PUT /api/operator/assistant/settings?usage=chat — 更新模型配置(ADMIN)
 *
 * 明文 apiKey 永不返回;GET 只回 apiKeyMask + configured。
 * PUT 后写审计 assistant.settings.update(details 落 mask 而非明文)。
 */
import type { Prisma } from "@prisma/client";

import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { maskApiKey } from "@/lib/crypto";
import { modelProfileUpdateSchema, modelUsageSchema } from "@/lib/validation/assistant";
import { readPublicProfile, updateProfile } from "@/lib/assistant/settings";

export const runtime = "nodejs";

function usageFromReq(req: Request) {
  const raw = new URL(req.url).searchParams.get("usage") ?? "chat";
  return modelUsageSchema.parse(raw);
}

export const GET = route(async (req) => {
  await requireRole("ADMIN");
  const usage = usageFromReq(req);
  return Response.json(await readPublicProfile(usage));
});

export const PUT = route(async (req) => {
  const session = await requireRole("ADMIN");
  const usage = usageFromReq(req);
  const input = await parseJson(req, modelProfileUpdateSchema);

  const before = await readPublicProfile(usage);
  const after = await updateProfile({ usage, ...input, updatedBy: session.username });

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "assistant.settings.update",
    targetType: "ai_model_profile",
    targetId: usage,
    details: {
      usage,
      before: {
        provider: before.provider,
        model: before.model,
        baseUrl: before.baseUrl,
        apiKeyMask: before.apiKeyMask,
      },
      after: {
        provider: after.provider,
        model: after.model,
        baseUrl: after.baseUrl,
        apiKeyMask: maskApiKey(input.apiKey),
      },
    } as Prisma.InputJsonValue,
  });

  return Response.json(after);
});
