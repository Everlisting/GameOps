/**
 * 阶段10 · AI 助手 · 会话 / 消息 / 执行 落库。
 *
 * 版本切换模型(10.2):
 *   - user 消息:role=user, parentId=null。
 *   - 助手回答:role=assistant, parentId=对应 user 消息 id;同一 parent 下多条 = 多个版本,active=true 为当前选中。
 *   - 重试:同 parentId 新增一条助手消息置 active(不新增 user 消息 → 天然去重 user)。
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface StartedTurn {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  variantIndex: number;
  variantCount: number;
}

function textOf(content: Prisma.JsonValue): string {
  if (content && typeof content === "object" && !Array.isArray(content) && "text" in content) {
    const t = (content as { text?: unknown }).text;
    return typeof t === "string" ? t : "";
  }
  return "";
}

/** 开一轮(新问答或重试的新版本),预建助手空消息以拿到 id。 */
export async function startTurn(args: {
  userId: string;
  conversationId?: string;
  userText: string;
  regenerateParentId?: string;
}): Promise<StartedTurn> {
  // 解析会话(不属本人 / 不存在 → 新建)
  let conversationId = args.conversationId;
  if (conversationId) {
    const owned = await prisma.aiConversation.findFirst({
      where: { id: conversationId, userId: args.userId },
      select: { id: true },
    });
    if (!owned) conversationId = undefined;
  }
  if (!conversationId) {
    const conv = await prisma.aiConversation.create({
      data: { userId: args.userId, title: args.userText.slice(0, 40) || "新对话" },
      select: { id: true },
    });
    conversationId = conv.id;
  } else {
    await prisma.aiConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  }

  // 重试:同 parent 新增版本
  if (args.regenerateParentId) {
    const parent = await prisma.aiMessage.findFirst({
      where: { id: args.regenerateParentId, conversationId, role: "user" },
      select: { id: true },
    });
    if (parent) {
      await prisma.aiMessage.updateMany({ where: { parentId: parent.id }, data: { active: false } });
      const asst = await prisma.aiMessage.create({
        data: { conversationId, role: "assistant", content: { text: "" }, parentId: parent.id, active: true },
        select: { id: true },
      });
      const variantCount = await prisma.aiMessage.count({ where: { parentId: parent.id } });
      return {
        conversationId,
        userMessageId: parent.id,
        assistantMessageId: asst.id,
        variantIndex: variantCount - 1,
        variantCount,
      };
    }
    // parent 不存在 → 退化为新一轮
  }

  // 新一轮:建 user + 助手空消息
  const user = await prisma.aiMessage.create({
    data: {
      conversationId,
      role: "user",
      content: { text: args.userText } as Prisma.InputJsonValue,
      active: true,
    },
    select: { id: true },
  });
  const asst = await prisma.aiMessage.create({
    data: { conversationId, role: "assistant", content: { text: "" }, parentId: user.id, active: true },
    select: { id: true },
  });
  return {
    conversationId,
    userMessageId: user.id,
    assistantMessageId: asst.id,
    variantIndex: 0,
    variantCount: 1,
  };
}

/** 填入助手最终文本。永不阻塞主流程。 */
export async function finishAssistant(assistantMessageId: string, text: string): Promise<void> {
  try {
    await prisma.aiMessage.update({
      where: { id: assistantMessageId },
      data: { content: { text } as Prisma.InputJsonValue },
    });
  } catch (err) {
    console.error("[assistant] finishAssistant failed", err);
  }
}

/** 切换某轮当前选中的助手版本。 */
export async function activateVariant(userId: string, messageId: string): Promise<boolean> {
  const msg = await prisma.aiMessage.findFirst({
    where: { id: messageId, role: "assistant" },
    select: { id: true, parentId: true, conversation: { select: { userId: true } } },
  });
  if (!msg || !msg.parentId || msg.conversation.userId !== userId) return false;
  await prisma.aiMessage.updateMany({ where: { parentId: msg.parentId }, data: { active: false } });
  await prisma.aiMessage.update({ where: { id: messageId }, data: { active: true } });
  return true;
}

export interface TurnDTO {
  user: { id: string; text: string };
  variants: Array<{ id: string; text: string }>;
  activeIndex: number;
}

/** 按轮返回会话:每个 user 消息 + 其所有助手版本 + 当前选中下标。 */
export async function getConversationTurns(conversationId: string): Promise<TurnDTO[]> {
  const msgs = await prisma.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, parentId: true, active: true },
  });
  const childrenByParent = new Map<string, typeof msgs>();
  for (const m of msgs) {
    if (m.role === "assistant" && m.parentId) {
      const arr = childrenByParent.get(m.parentId) ?? [];
      arr.push(m);
      childrenByParent.set(m.parentId, arr);
    }
  }
  return msgs
    .filter((m) => m.role === "user" && !m.parentId)
    .map((u) => {
      const kids = childrenByParent.get(u.id) ?? [];
      const ai = kids.findIndex((k) => k.active);
      return {
        user: { id: u.id, text: textOf(u.content) },
        variants: kids.map((k) => ({ id: k.id, text: textOf(k.content) })),
        activeIndex: ai < 0 ? Math.max(0, kids.length - 1) : ai,
      };
    });
}

export async function beginRun(conversationId: string, model: string): Promise<string> {
  const run = await prisma.aiRun.create({
    data: { conversationId, model, status: "running" },
    select: { id: true },
  });
  return run.id;
}

export async function finishRun(
  runId: string,
  data: {
    status: "succeeded" | "failed";
    inputTokens?: number | null;
    outputTokens?: number | null;
    latencyMs?: number;
    errorMessage?: string;
  },
): Promise<void> {
  try {
    await prisma.aiRun.update({
      where: { id: runId },
      data: {
        status: data.status,
        inputTokens: data.inputTokens ?? null,
        outputTokens: data.outputTokens ?? null,
        latencyMs: data.latencyMs ?? null,
        errorMessage: data.errorMessage ?? null,
        finishedAt: new Date(),
      },
    });
  } catch (err) {
    console.error("[assistant] finishRun failed", err);
  }
}

/** 阶段10.2 · 记一次工具调用轨迹。永不阻塞主流程。 */
export async function recordToolCall(
  runId: string,
  data: {
    toolName: string;
    args: Prisma.InputJsonValue;
    resultSummary?: Prisma.InputJsonValue;
    latencyMs?: number;
    isError?: boolean;
  },
): Promise<void> {
  try {
    await prisma.aiToolCall.create({
      data: {
        runId,
        toolName: data.toolName,
        args: data.args,
        resultSummary: data.resultSummary,
        latencyMs: data.latencyMs ?? null,
        isError: data.isError ?? false,
      },
    });
  } catch (err) {
    console.error("[assistant] recordToolCall failed", err);
  }
}
