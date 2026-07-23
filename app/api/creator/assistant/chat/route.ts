/**
 * POST /api/creator/assistant/chat — 创作者知识库问答(流式,持久化,audience=creator)。
 * 只挂 knowledge_search 工具(按 CREATOR 角色过滤知识库);无任何业务数据工具。
 * 会话落库(仅保留 1 月,见 lib/assistant/retention);响应头回传 x-conversation-id。
 */
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";

import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { chatInputSchema } from "@/lib/validation/assistant";
import { getChatModel } from "@/lib/assistant/model";
import { CREATOR_SYSTEM_PROMPT } from "@/lib/assistant/agent";
import { TOOL_DEFS } from "@/lib/assistant/tools/schemas";
import { knowledgeSearchTool } from "@/lib/assistant/tools/knowledge";
import { startTurn, finishAssistant } from "@/lib/assistant/persistence";

export const runtime = "nodejs";

function lastUserText(messages: Array<{ role: string; parts?: unknown[]; content?: unknown }>): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  const parts = Array.isArray(last.parts) ? last.parts : [];
  return parts
    .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : ""))
    .join("")
    .trim();
}

export const POST = route(async (req) => {
  const session = await requireRole("CREATOR");
  const body = await parseJson(req, chatInputSchema);

  const { model } = await getChatModel();
  const turn = await startTurn({
    userId: session.sub,
    conversationId: body.conversationId,
    userText: lastUserText(body.messages),
    audience: "creator",
  });
  const messages = await convertToModelMessages(body.messages as unknown as UIMessage[]);

  const result = streamText({
    model,
    system: CREATOR_SYSTEM_PROMPT,
    messages,
    tools: { [TOOL_DEFS.knowledgeSearch.name]: knowledgeSearchTool(session) },
    stopWhen: stepCountIs(4),
    onFinish: async ({ text }) => {
      await finishAssistant(turn.assistantMessageId, text);
    },
  });

  return result.toUIMessageStreamResponse({ headers: { "x-conversation-id": turn.conversationId } });
});
