/**
 * GET /api/operator/admin/feishu/chats — 已发现的飞书会话(白名单管理,ADMIN)。
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { feishuChatDb } from "@/lib/feishu/db";

export const runtime = "nodejs";

export const GET = route(async () => {
  await requireRole("ADMIN");
  const rows = await feishuChatDb.findMany({ orderBy: { lastSeenAt: "desc" } });
  return Response.json({
    chats: rows.map((c) => ({
      id: c.id,
      chatId: c.chatId,
      name: c.name,
      chatType: c.chatType,
      allowed: c.allowed,
      lastSeenAt: c.lastSeenAt.toISOString(),
    })),
  });
});
