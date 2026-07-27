/**
 * PATCH  /api/operator/admin/feishu/[id] — 改 webhook(ADMIN)
 * DELETE /api/operator/admin/feishu/[id] — 删 webhook(ADMIN)
 */
import type { Prisma } from "@prisma/client";

import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { badRequest } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { feishuUpdateSchema } from "@/lib/validation/feishu";
import { updateWebhook, deleteWebhook } from "@/lib/feishu/config";

export const runtime = "nodejs";

export const PATCH = route(async (req, { params }) => {
  const session = await requireRole("ADMIN");
  const id = params?.id ?? "";
  if (!id) throw badRequest("缺少 id");
  const input = await parseJson(req, feishuUpdateSchema);
  const w = await updateWebhook(id, input);
  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "feishu.webhook.update",
    targetType: "feishu_webhook",
    targetId: id,
    details: { fields: Object.keys(input) } as Prisma.InputJsonValue,
  });
  return Response.json({ webhook: w });
});

export const DELETE = route(async (_req, { params }) => {
  const session = await requireRole("ADMIN");
  const id = params?.id ?? "";
  if (!id) throw badRequest("缺少 id");
  await deleteWebhook(id);
  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "feishu.webhook.delete",
    targetType: "feishu_webhook",
    targetId: id,
  });
  return Response.json({ ok: true });
});
