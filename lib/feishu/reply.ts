/**
 * 用 tenant_access_token 调 im/v1/messages 把回复(markdown→交互卡片)发回飞书会话。
 */
import { getTenantAccessToken, FEISHU_BASE } from "@/lib/feishu/app";
import { mdToCardElements } from "@/lib/feishu/markdown";

/** 发交互卡片(markdown 渲染:表格/链接)到指定 chat。 */
export async function replyToChat(chatId: string, markdown: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const token = await getTenantAccessToken();
    const card = {
      schema: "2.0",
      config: { wide_screen_mode: true, width_mode: "fill" },
      header: { title: { tag: "plain_text", content: "AI 助手" }, template: "blue" },
      body: { elements: mdToCardElements(markdown) },
    };
    const res = await fetch(`${FEISHU_BASE}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ receive_id: chatId, msg_type: "interactive", content: JSON.stringify(card) }),
    });
    const data = (await res.json().catch(() => ({}))) as { code?: number; msg?: string };
    return { ok: data.code === 0, msg: data.msg ?? `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : "网络错误" };
  }
}

/** 取群/会话名称(best-effort,用于白名单展示);失败返回空串。 */
export async function getChatName(chatId: string): Promise<string> {
  try {
    const token = await getTenantAccessToken();
    const res = await fetch(`${FEISHU_BASE}/open-apis/im/v1/chats/${encodeURIComponent(chatId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => ({}))) as { code?: number; data?: { name?: string } };
    return data.code === 0 ? data.data?.name ?? "" : "";
  } catch {
    return "";
  }
}
