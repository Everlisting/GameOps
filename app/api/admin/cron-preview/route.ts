/**
 * GET /api/admin/cron-preview?expr=<cron> — 给 UI 用,预览 cron 下次执行时间。
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { badRequest } from "@/lib/errors";
import { getNextRunAt } from "@/lib/cron-scheduler";
import { isValidCronExpression } from "@/lib/validation/job";

export const runtime = "nodejs";

export const GET = route(async (req) => {
  await requireRole("ADMIN");
  const url = new URL(req.url);
  const expr = (url.searchParams.get("expr") ?? "").trim();
  if (!expr) throw badRequest("缺少 expr");
  if (!isValidCronExpression(expr)) throw badRequest("cron 表达式非法(必须 5 段,只允许 0-9 * , - /)");
  const next = await getNextRunAt(expr);
  if (!next) throw badRequest("无法计算下次执行时间");
  return Response.json({ nextRunAt: next.toISOString() });
});
