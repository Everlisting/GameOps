/**
 * 用 tenant_access_token 调 im/v1/messages 把回复(markdown→交互卡片)发回飞书会话。
 */
import { getTenantAccessToken, FEISHU_BASE } from "@/lib/feishu/app";
import { mdToCardElements, chunkCardElements } from "@/lib/feishu/markdown";
import { logExternalResult } from "@/lib/logger/external";

/** 构造飞书 2.0 交互卡片(update_multi 必须 true;不用 1.0 的 wide_screen_mode)。 */
function buildCard(elements: unknown[], title = "AI 助手") {
  return {
    schema: "2.0",
    config: { width_mode: "fill", update_multi: true },
    header: { title: { tag: "plain_text", content: title }, template: "blue" },
    body: { elements },
  };
}

/** POST 一张卡片,返回 message_id。 */
async function postCard(
  chatId: string,
  card: unknown,
): Promise<{ ok: boolean; messageId: string | null; msg: string }> {
  try {
    const token = await getTenantAccessToken();
    const res = await fetch(`${FEISHU_BASE}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ receive_id: chatId, msg_type: "interactive", content: JSON.stringify(card) }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      code?: number;
      msg?: string;
      data?: { message_id?: string };
    };
    if (data.code !== 0) {
      logExternalResult("feishu", "im.message.send", { ok: false, code: data.code, detail: data.msg });
    }
    return {
      ok: data.code === 0,
      messageId: data.data?.message_id ?? null,
      msg: `code=${data.code ?? "?"} ${data.msg ?? `HTTP ${res.status}`}`,
    };
  } catch (err) {
    return { ok: false, messageId: null, msg: err instanceof Error ? err.message : "网络错误" };
  }
}

/** PATCH 更新一张已发卡片。 */
async function patchCard(messageId: string, card: unknown): Promise<{ ok: boolean; msg: string }> {
  try {
    const token = await getTenantAccessToken();
    const res = await fetch(`${FEISHU_BASE}/open-apis/im/v1/messages/${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: JSON.stringify(card) }),
    });
    const data = (await res.json().catch(() => ({}))) as { code?: number; msg?: string };
    if (data.code !== 0) {
      logExternalResult("feishu", "im.message.update", { ok: false, code: data.code, detail: data.msg });
    }
    return { ok: data.code === 0, msg: `code=${data.code ?? "?"} ${data.msg ?? `HTTP ${res.status}`}` };
  } catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : "网络错误" };
  }
}

/** 发一张交互卡片(如「思考中」占位),返回 message_id 供后续更新。 */
export async function sendCard(
  chatId: string,
  markdown: string,
): Promise<{ ok: boolean; messageId: string | null; msg: string }> {
  return postCard(chatId, buildCard(mdToCardElements(markdown)));
}

/**
 * 把 markdown 答案投递到会话:超飞书卡片上限时**自动拆成多张卡片**依次发送(不降级纯文本)。
 * 首块若给了 updateMessageId,则更新那条「思考中」卡片(失败回退发新);其余块追加发送。
 * 多张时标题标注「(i/n)」。
 */
export async function deliverMarkdown(
  chatId: string,
  markdown: string,
  updateMessageId?: string,
): Promise<{ ok: boolean; msg: string }> {
  const chunks = chunkCardElements(mdToCardElements(markdown));
  const total = chunks.length;
  let ok = true;
  let lastMsg = "ok";
  for (let i = 0; i < total; i++) {
    const title = total > 1 ? `AI 助手（${i + 1}/${total}）` : "AI 助手";
    const card = buildCard(chunks[i], title);
    let r: { ok: boolean; msg: string };
    if (i === 0 && updateMessageId) {
      r = await patchCard(updateMessageId, card);
      if (!r.ok) r = await postCard(chatId, card); // 更新失败 → 发新卡片
    } else {
      r = await postCard(chatId, card);
    }
    if (!r.ok) {
      ok = false;
      lastMsg = r.msg;
    }
  }
  return { ok, msg: lastMsg };
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
