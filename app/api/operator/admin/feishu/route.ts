/**
 * GET  /api/operator/admin/feishu — webhook 列表(打码,ADMIN)
 * POST /api/operator/admin/feishu — 新增 webhook(ADMIN)
 */
import type { Prisma } from "@prisma/client";

import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { feishuCreateSchema } from "@/lib/validation/feishu";
import { listWebhooks, createWebhook } from "@/lib/feishu/config";

export const runtime = "nodejs";

export const GET = route(async () => {
  await requireRole("ADMIN");
  return Response.json({ webhooks: await listWebhooks() });
});

export const POST = route(async (req) => {
  const session = await requireRole("ADMIN");
  const input = await parseJson(req, feishuCreateSchema);
  const w = await createWebhook(input, session.sub);
  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "feishu.webhook.create",
    targetType: "feishu_webhook",
    targetId: w.id,
    details: { name: w.name, dailyReport: w.dailyReport } as Prisma.InputJsonValue,
  });
  return Response.json({ webhook: w }, { status: 201 });
});
