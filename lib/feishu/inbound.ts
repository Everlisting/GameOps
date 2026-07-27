/**
 * 飞书入站消息处理:白名单 + 群@校验 → 跑只读 Agent(数据+知识库)→ 回发。
 * 由事件回调「立即 ack 后」在后台调用(LLM 耗时 > 飞书 3s 重试窗,必须异步)。
 */
import type { Role } from "@prisma/client";
import { generateText, stepCountIs } from "ai";

import { getChatModel } from "@/lib/assistant/model";
import { getSystemPrompt } from "@/lib/assistant/agent";
import { makeReadonlyTools } from "@/lib/assistant/tools";
import { getBotOpenId } from "@/lib/feishu/app";
import {
  upsertChatSeen,
  ensureConversation,
  loadRecentMessages,
  appendMessages,
} from "@/lib/feishu/chat";
import { sendCard, deliverMarkdown } from "@/lib/feishu/reply";

export interface ParsedFeishuMessage {
  chatId: string;
  chatType: string; // group / p2p
  text: string;
  mentionOpenIds: string[]; // 本条消息里被 @ 的所有人的 open_id
}

export async function processFeishuMessage(msg: ParsedFeishuMessage): Promise<void> {
  const chat = await upsertChatSeen(msg.chatId, msg.chatType);
  if (!chat.allowed) return; // 未授权会话:静默(管理员需在配置页勾选)
  // 群里必须精确 @机器人本人才应答(仅 @ 其他人不触发);拿不到 bot open_id 时回退为"有@即应答"
  if (msg.chatType === "group") {
    const botOpenId = await getBotOpenId();
    const mentionedBot = botOpenId
      ? msg.mentionOpenIds.includes(botOpenId)
      : msg.mentionOpenIds.length > 0;
    if (!mentionedBot) return;
  }
  const text = msg.text.trim();
  if (!text) return;

  const conversationId = await ensureConversation(chat);
  const history = await loadRecentMessages(conversationId, 12);

  // 先秒回「思考中」占位卡片,拿到 message_id;生成完后原地更新为答案(避免用户以为没发出去)
  const thinking = await sendCard(msg.chatId, "🤔 正在思考,请稍候…");

  const { model } = await getChatModel();
  const system = await getSystemPrompt();
  // 飞书用户非登录中台账号:统一按只读 OPERATOR 处理(知识库 ACL 取运营可见)
  const session = { sub: `feishu:${msg.chatId}`, username: "feishu", role: "OPERATOR" as Role };

  let answer = "";
  try {
    const result = await generateText({
      model,
      system,
      messages: [...history, { role: "user", content: text }],
      tools: makeReadonlyTools(session),
      stopWhen: stepCountIs(6),
    });
    answer = result.text?.trim() ?? "";
  } catch (err) {
    console.error("[feishu] agent 生成失败", err);
    answer = "抱歉,处理你的问题时出错了,请稍后再试。";
  }
  if (!answer) answer = "(未生成内容)";

  await appendMessages(conversationId, text, answer);

  if (!thinking.ok) {
    console.error("[feishu] 「思考中」卡片发送失败:", thinking.msg);
  }
  // 投递答案:超飞书卡片上限时自动拆成多张卡片(首块更新「思考中」卡片,其余追加)
  const sent = await deliverMarkdown(
    msg.chatId,
    answer,
    thinking.ok && thinking.messageId ? thinking.messageId : undefined,
  );
  if (!sent.ok) {
    console.error(`[feishu] 回发消息失败(chat=${msg.chatId}):${sent.msg}`);
  }
}
