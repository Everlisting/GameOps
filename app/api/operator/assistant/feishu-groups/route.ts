/**
 * GET /api/operator/assistant/feishu-groups — 启用中的飞书群 {id,name}(OPERATOR)。
 * 供助手输入框的「同时发送到飞书群」多选下拉使用(只回名称/id,不含 url/密钥)。
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { listWebhooks } from "@/lib/feishu/config";

export const runtime = "nodejs";

export const GET = route(async () => {
  await requireRole("OPERATOR");
  const groups = (await listWebhooks())
    .filter((w) => w.enabled)
    .map((w) => ({ id: w.id, name: w.name }));
  return Response.json({ groups });
});
