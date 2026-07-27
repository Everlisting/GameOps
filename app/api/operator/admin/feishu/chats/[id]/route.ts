/**
 * PATCH  /api/operator/admin/feishu/chats/[id] — 会话白名单开关(ADMIN)。
 * DELETE /api/operator/admin/feishu/chats/[id] — 移除会话记录 + 其绑定对话(ADMIN)。
 */
import type { Prisma } from "@prisma/client";

import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { badRequest, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { feishuChatPatchSchema } from "@/lib/validation/feishu";
import { feishuChatDb } from "@/lib/feishu/db";

export const runtime = "nodejs";

export const PATCH = route(async (req, { params }) => {
  const session = await requireRole("ADMIN");
  const id = params?.id ?? "";
  if (!id) throw badRequest("缺少 id");
  const { allowed } = await parseJson(req, feishuChatPatchSchema);
  const row = await feishuChatDb.update({ where: { id }, data: { allowed } });
  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "feishu.chat.allow",
    targetType: "feishu_chat",
    targetId: id,
    details: { chatId: row.chatId, allowed } as Prisma.InputJsonValue,
  });
  return Response.json({ ok: true, allowed: row.allowed });
});

export const DELETE = route(async (_req, { params }) => {
  const session = await requireRole("ADMIN");
  const id = params?.id ?? "";
  if (!id) throw badRequest("缺少 id");

  const row = await feishuChatDb.findUnique({ where: { id } });
  if (!row) throw notFound("会话不存在");

  // 先删记录,再清其绑定的 AiConversation(级联删消息);删对话失败不影响会话已移除
  await feishuChatDb.delete({ where: { id } });
  if (row.conversationId) {
    await prisma.aiConversation.delete({ where: { id: row.conversationId } }).catch(() => {});
  }

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "feishu.chat.delete",
    targetType: "feishu_chat",
    targetId: id,
    details: { chatId: row.chatId, name: row.name } as Prisma.InputJsonValue,
  });
  return Response.json({ ok: true });
});
