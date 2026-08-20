/**
 * GET /api/operator/admin/feishu/report — 日报配置 + 当前预览数据(ADMIN)
 * PUT /api/operator/admin/feishu/report — 保存全局日报配置(ADMIN)
 */
import type { Prisma } from "@prisma/client";

import { parseJson, route } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { requireRole } from "@/lib/rbac";
import { chinaDateString } from "@/lib/time";
import { getFeishuReportConfig, saveFeishuReportConfig } from "@/lib/feishu/report-config";
import { getDailyReportData } from "@/lib/feishu/report";
import { feishuReportConfigSchema } from "@/lib/validation/feishu";

export const runtime = "nodejs";

export const GET = route(async () => {
  await requireRole("ADMIN");
  const [config, data] = await Promise.all([
    getFeishuReportConfig(),
    getDailyReportData(),
  ]);
  return Response.json({ config, data, dateText: chinaDateString() });
});

export const PUT = route(async (req) => {
  const session = await requireRole("ADMIN");
  const input = await parseJson(req, feishuReportConfigSchema);
  const before = await getFeishuReportConfig();
  const config = await saveFeishuReportConfig(input, session.username);
  const changedFields = Object.keys(input).filter((key) => {
    const field = key as keyof typeof input;
    return before[field] !== input[field];
  });

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "feishu.report.update",
    targetType: "feishu_report_config",
    targetId: "1",
    details: { changedFields } as Prisma.InputJsonValue,
  });

  const data = await getDailyReportData();
  return Response.json({ config, data, dateText: chinaDateString() });
});
