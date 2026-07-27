/**
 * 飞书会话白名单 + 多轮记忆绑定。
 * 收到消息自动登记会话(allowed 默认 false,管理员在配置页勾选才应答);
 * 每个会话绑定一条 AiConversation(audience=feishu)做多轮上下文。
 */
import { prisma } from "@/lib/db";
import { feishuChatDb, type FeishuChatRow } from "@/lib/feishu/db";
import { getChatName } from "@/lib/feishu/reply";

/** 收到消息时登记/更新会话;新会话尽量补一次群名。 */
export async function upsertChatSeen(
  chatId: string,
  chatType: string,
): Promise<FeishuChatRow> {
  const existing = await feishuChatDb.findUnique({ where: { chatId } });
  if (existing) {
    return feishuChatDb.update({ where: { chatId }, data: { lastSeenAt: new Date() } });
  }
  const name = await getChatName(chatId); // best-effort
  return feishuChatDb.upsert({
    where: { chatId },
    create: { chatId, chatType, name, lastSeenAt: new Date() },
    update: { lastSeenAt: new Date() },
  });
}

/** 取/建绑定的 AiConversation(audience=feishu)。 */
export async function ensureConversation(chat: FeishuChatRow): Promise<string> {
  if (chat.conversationId) return chat.conversationId;
  const conv = await prisma.aiConversation.create({
    data: {
      userId: `feishu:${chat.chatId}`, // 无外键的快照 id
      title: chat.name || "飞书对话",
      audience: "feishu",
    },
    select: { id: true },
  });
  await feishuChatDb.update({ where: { id: chat.id }, data: { conversationId: conv.id } });
  return conv.id;
}

function textOf(content: unknown): string {
  if (content && typeof content === "object" && "text" in content) {
    const t = (content as { text?: unknown }).text;
    return typeof t === "string" ? t : "";
  }
  return "";
}

/** 载入最近 N 轮消息作为模型上下文(时间正序)。 */
export async function loadRecentMessages(
  conversationId: string,
  take = 12,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const rows = await prisma.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take,
    select: { role: true, content: true },
  });
  return rows
    .reverse()
    .map((r) => ({
      role: r.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: textOf(r.content),
    }))
    .filter((m) => m.content);
}

/** 追加一轮 user + assistant 消息。 */
export async function appendMessages(
  conversationId: string,
  userText: string,
  assistantText: string,
): Promise<void> {
  await prisma.aiMessage.create({
    data: { conversationId, role: "user", content: { text: userText } },
  });
  await prisma.aiMessage.create({
    data: { conversationId, role: "assistant", content: { text: assistantText } },
  });
  await prisma.aiConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
}
