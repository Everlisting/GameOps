/**
 * POST /api/operator/assistant/chat — 运营 AI 助手对话(流式 SSE)。
 *
 * 阶段 10.1:仅对话,不挂工具(工具见 10.2)。
 * 落库:ensureConversation(+user 消息)→ beginRun → onFinish 落 assistant 消息 + usage;
 * 审计:assistant.chat。
 */
import type { Prisma } from "@prisma/client";
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";

import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { chatInputSchema } from "@/lib/validation/assistant";
import { getChatModel } from "@/lib/assistant/model";
import { getSystemPrompt } from "@/lib/assistant/agent";
import { makeTools } from "@/lib/assistant/tools";
import {
  ensureConversation,
  beginRun,
  finishRun,
  recordToolCall,
} from "@/lib/assistant/persistence";

export const runtime = "nodejs"; // 必须:Edge 不能用 prisma / crypto / argon2

/** 从最后一条 user 消息提取纯文本(用于会话标题 + user 消息留存) */
function lastUserText(
  messages: Array<{ role: string; parts?: unknown[]; content?: unknown }>,
): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  const parts = Array.isArray(last.parts) ? last.parts : [];
  return parts
    .map((p) =>
      p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : "",
    )
    .join("")
    .trim();
}

export const POST = route(async (req) => {
  const session = await requireRole("OPERATOR");
  const body = await parseJson(req, chatInputSchema);

  const { model, modelId } = await getChatModel();
  const conversationId = await ensureConversation(
    session.sub,
    body.conversationId,
    lastUserText(body.messages),
  );
  const runId = await beginRun(conversationId, modelId);
  const startedAt = Date.now();

  const [systemPrompt, modelMessages] = await Promise.all([
    getSystemPrompt(),
    convertToModelMessages(body.messages as unknown as UIMessage[]),
  ]);

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "assistant.chat",
    targetType: "ai_conversation",
    targetId: conversationId,
    details: { runId, model: modelId },
  });

  const result = streamText({
    model,
    system: systemPrompt,
    messages: modelMessages,
    tools: makeTools(session),
    stopWhen: stepCountIs(8), // 多轮工具循环上限,防失控
    onStepFinish: async ({ toolCalls, toolResults }) => {
      const outputById = new Map(toolResults.map((r) => [r.toolCallId, r.output]));
      for (const call of toolCalls) {
        const args = call.input as Prisma.InputJsonValue;
        await recordAudit({
          actorId: session.sub,
          actorUsername: session.username,
          action: "assistant.tool_call",
          targetType: "ai_conversation",
          targetId: conversationId,
          details: {
            runId,
            toolCallId: call.toolCallId,
            tool: call.toolName,
            args,
          } as Prisma.InputJsonValue,
        });
        await recordToolCall(runId, {
          toolName: call.toolName,
          args,
          resultSummary: outputById.get(call.toolCallId) as Prisma.InputJsonValue | undefined,
        });
      }
    },
    onFinish: async ({ text, usage }) => {
      await finishRun(runId, {
        status: "succeeded",
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
        latencyMs: Date.now() - startedAt,
        assistantText: text,
        conversationId,
      });
    },
    onError: async ({ error }) => {
      await finishRun(runId, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startedAt,
      });
    },
  });

  return result.toUIMessageStreamResponse({
    headers: { "x-conversation-id": conversationId },
  });
});
