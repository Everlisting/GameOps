/**
 * GET /api/operator/admin/feishu/app — 自建应用配置视图(打码,ADMIN)
 * PUT /api/operator/admin/feishu/app — 保存配置(ADMIN)
 */
import type { Prisma } from "@prisma/client";

import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { feishuAppSchema } from "@/lib/validation/feishu";
import {
  getFeishuAppView,
  previewFeishuAppConfig,
  saveFeishuAppConfig,
} from "@/lib/feishu/app";
import {
  getFeishuWSStatus,
  reconfigureFeishuWS,
} from "@/lib/feishu/ws";

export const runtime = "nodejs";

export const GET = route(async () => {
  await requireRole("ADMIN");
  return Response.json({
    app: await getFeishuAppView(),
    connection: getFeishuWSStatus(),
  });
});

export const PUT = route(async (req) => {
  const session = await requireRole("ADMIN");
  const input = await parseJson(req, feishuAppSchema);
  const nextConfig = await previewFeishuAppConfig(input);
  const connection = await reconfigureFeishuWS(nextConfig, () =>
    saveFeishuAppConfig(input, session.username),
  );
  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "feishu.app.update",
    targetType: "feishu_app",
    targetId: "1",
    details: {
      fields: Object.keys(input),
      connectionState: connection.state,
    } as Prisma.InputJsonValue,
  });
  return Response.json({
    app: await getFeishuAppView(),
    connection,
  });
});
