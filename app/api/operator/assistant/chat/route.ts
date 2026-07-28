/**
 * POST /api/operator/assistant/chat — 运营 AI 助手对话(流式 SSE)。
 *
 * 版本切换(10.2):regenerateParentId 存在 → 同一轮新增助手版本;否则新开一轮。
 * 响应头回传 DB id + 版本信息,供前端做 ‹ › 切换与反馈定位。
 */
import type { Prisma } from "@prisma/client";
import { streamText, convertToModelMessages, stepCountIs, hasToolCall, type UIMessage } from "ai";

import { route, parseJson } from "@/lib/api";
import { createLogger, getLogContext } from "@/lib/logger";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { chatInputSchema } from "@/lib/validation/assistant";
import { getChatModel } from "@/lib/assistant/model";
import { getSystemPrompt } from "@/lib/assistant/agent";
import { makeTools, WRITE_TOOL_NAMES } from "@/lib/assistant/tools";
import { deliverToGroups } from "@/lib/feishu/send";
import {
  startTurn,
  beginRun,
  finishRun,
  finishAssistant,
  recordToolCall,
} from "@/lib/assistant/persistence";

export const runtime = "nodejs"; // 必须:Edge 不能用 prisma / crypto / argon2

const log = createLogger("assistant");

// 写工具在 UI 消息里的 part type(tool-<name>)+ 刷新重建的 data-approval part,都要从发给模型的历史里剥掉。
const WRITE_TOOL_PART_TYPES = new Set([
  ...WRITE_TOOL_NAMES.map((n) => `tool-${n}`),
  "data-approval",
]);

/**
 * 剥掉历史里的写工具交互(及刷新重建的审批 part)再发给模型。
 * 否则模型会看到上一轮那条"待审批"结果,凭记忆复述/复用旧审批单号,而不重新发起工具调用。
 * 数据类工具(activity_summary 等)结果保留,供多轮上下文;当前轮的工具调用发生在流内,不受影响。
 */
function stripWriteToolHistory(
  messages: Array<{ role: string; parts?: unknown[]; content?: unknown }>,
): Array<{ role: string; parts?: unknown[]; content?: unknown }> {
  return messages
    .map((m) => {
      if (!Array.isArray(m.parts)) return m;
      const parts = m.parts.filter(
        (p) =>
          !(
            p &&
            typeof p === "object" &&
            "type" in p &&
            WRITE_TOOL_PART_TYPES.has(String((p as { type: unknown }).type))
          ),
      );
      return { ...m, parts };
    })
    // 剥空的助手消息丢掉(user 恒保留)
    .filter((m) => m.role === "user" || !Array.isArray(m.parts) || m.parts.length > 0);
}

/** 从最后一条 user 消息提取纯文本。 */
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
  const turn = await startTurn({
    userId: session.sub,
    conversationId: body.conversationId,
    userText: lastUserText(body.messages),
    regenerateParentId: body.regenerateParentId,
  });
  const runId = await beginRun(turn.conversationId, modelId);
  const startedAt = Date.now();
  // onFinish/onError 在 route() 返回后触发、ALS 已失效 → 此处同步捕获 requestId 显式带入
  const requestId = getLogContext()?.requestId;
  const toolNames = new Set<string>();

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "assistant.chat",
    targetType: "ai_conversation",
    targetId: turn.conversationId,
    details: { runId, model: modelId, regenerate: !!body.regenerateParentId },
  });

  const [systemPrompt, modelMessages] = await Promise.all([
    getSystemPrompt(),
    convertToModelMessages(stripWriteToolHistory(body.messages) as unknown as UIMessage[]),
  ]);

  // 写工具因 stopWhen 停在审批卡片、模型不再吐文字;记下 approvalId 存进助手消息,
  // 刷新后能据此重建审批卡片(卡片自拉当前状态),历史不再缺信息。
  let approvalId: string | null = null;

  const result = streamText({
    model,
    system: systemPrompt,
    messages: modelMessages,
    tools: makeTools(session, { conversationId: turn.conversationId, runId }),
    // 任一写工具(需审批)被调用就停止本轮:回合干净停在审批卡片上,不再生成"已提交待审批…"之类
    // 的后续文字(那会让人误以为流程没等批准就走完了)。真正的执行在用户点「批准」后由卡片触发。
    stopWhen: [stepCountIs(8), ...WRITE_TOOL_NAMES.map((n) => hasToolCall(n))],
    onStepFinish: async ({ toolCalls, toolResults }) => {
      const outputById = new Map(toolResults.map((r) => [r.toolCallId, r.output]));
      for (const call of toolCalls) {
        toolNames.add(call.toolName);
        const args = call.input as Prisma.InputJsonValue;
        await recordAudit({
          actorId: session.sub,
          actorUsername: session.username,
          action: "assistant.tool_call",
          targetType: "ai_conversation",
          targetId: turn.conversationId,
          details: { runId, toolCallId: call.toolCallId, tool: call.toolName, args } as Prisma.InputJsonValue,
        });
        const out = outputById.get(call.toolCallId);
        await recordToolCall(runId, {
          toolName: call.toolName,
          args,
          resultSummary: out as Prisma.InputJsonValue | undefined,
        });
        // 任一写工具返回 pending 提案 → 记下 approvalId(存进助手消息,供刷新后重建卡片)
        if (out && typeof out === "object" && (out as { ok?: unknown }).ok === true) {
          const aid = (out as { approvalId?: unknown }).approvalId;
          if (typeof aid === "string") approvalId = aid;
        }
      }
    },
    onFinish: async ({ text, usage }) => {
      await finishAssistant(turn.assistantMessageId, text.trim(), approvalId);
      // 用户在输入框选了飞书群 → 把本轮回复同时投递一份到这些群(页面照常输出)
      if (body.feishuGroupIds && body.feishuGroupIds.length > 0 && text.trim()) {
        void deliverToGroups(body.feishuGroupIds, text.trim(), {
          id: session.sub,
          username: session.username,
        });
      }
      const latencyMs = Date.now() - startedAt;
      await finishRun(runId, {
        status: "succeeded",
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
        latencyMs,
      });
      // 只记元数据(runId/model/token/耗时/工具名),不记提示词与回复内容
      log.info("AI 流式完成", {
        event: "assistant.stream.completed",
        runId,
        requestId,
        conversationId: turn.conversationId,
        model: modelId,
        durationMs: latencyMs,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        tools: [...toolNames],
      });
    },
    onError: async ({ error }) => {
      const latencyMs = Date.now() - startedAt;
      log.error("AI 流式失败", {
        event: "assistant.stream.failed",
        runId,
        requestId,
        conversationId: turn.conversationId,
        model: modelId,
        durationMs: latencyMs,
        err: error,
        persist: true,
      });
      await finishRun(runId, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        latencyMs,
      });
    },
  });

  return result.toUIMessageStreamResponse({
    headers: {
      "x-conversation-id": turn.conversationId,
      "x-user-message-id": turn.userMessageId,
      "x-assistant-message-id": turn.assistantMessageId,
      "x-variant-index": String(turn.variantIndex),
      "x-variant-count": String(turn.variantCount),
    },
  });
});
