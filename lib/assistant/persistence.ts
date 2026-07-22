/**
 * 阶段10 · AI 助手 · 会话 / 消息 / 执行 落库。
 *
 * 会话属主 = userId(User.id 快照,不建外键);越权校验:带 conversationId 时必须属本人。
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/** 确保会话存在(无有效 id 则新建),并落一条 user 消息。返回会话 id。 */
export async function ensureConversation(
  userId: string,
  conversationId: string | undefined,
  userText: string,
): Promise<string> {
  const userContent = { text: userText } as Prisma.InputJsonValue;
  if (conversationId) {
    const exist = await prisma.aiConversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (exist) {
      await prisma.aiMessage.create({
        data: { conversationId, role: "user", content: userContent },
      });
      await prisma.aiConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      return conversationId;
    }
    // 传了但不属本人 / 不存在 → 忽略,新建(不泄露他人会话)
  }
  const conv = await prisma.aiConversation.create({
    data: {
      userId,
      title: userText.slice(0, 40) || "新对话",
      messages: { create: { role: "user", content: userContent } },
    },
    select: { id: true },
  });
  return conv.id;
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
    assistantText?: string;
    conversationId?: string;
  },
): Promise<void> {
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
  if (data.status === "succeeded" && data.conversationId && data.assistantText) {
    await prisma.aiMessage.create({
      data: {
        conversationId: data.conversationId,
        role: "assistant",
        content: { text: data.assistantText } as Prisma.InputJsonValue,
      },
    });
  }
}

/** 阶段10.2 · 记一次工具调用轨迹(工具名 / 入参 / 结果摘要)。永不阻塞主流程。 */
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
