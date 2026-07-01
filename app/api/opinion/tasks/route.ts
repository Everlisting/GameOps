/**
 * GET /api/opinion/tasks?scope=&status=&limit=&offset= — 报告任务列表
 *
 * 鉴权:OPERATOR+(运营 / 管理员均可看)
 * 中台不落表,数据来自分析服务的 SQLite,直接代理。
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { listQuerySchema } from "@/lib/validation/opinion";
import { listTasks } from "@/lib/opinion/client";

export const GET = route(async (req) => {
  await requireRole("OPERATOR");
  const url = new URL(req.url);
  const q = listQuerySchema.parse(Object.fromEntries(url.searchParams));

  const data = await listTasks(q);
  return Response.json(data);
});
