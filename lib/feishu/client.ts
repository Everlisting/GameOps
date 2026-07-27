/**
 * 飞书群自定义机器人发送客户端。
 * 加签(可选):string_to_sign = `${timestamp}\n${secret}`,
 *   sign = base64(HMAC-SHA256(key=string_to_sign, data="")),随 body 一起 POST。
 * 成功判定:响应 code===0(新版)或 StatusCode===0(旧版)。
 */
import { createHmac } from "node:crypto";

export interface FeishuTarget {
  url: string;
  secret?: string; // 空/undefined = 不加签
}

/** 飞书消息 payload:text 或 interactive(card)。 */
export type FeishuPayload =
  | { msg_type: "text"; content: { text: string } }
  | { msg_type: "interactive"; card: unknown };

export interface FeishuSendResult {
  ok: boolean;
  code: number;
  msg: string;
}

function sign(secret: string, timestamp: number): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return createHmac("sha256", stringToSign).update("").digest("base64");
}

/** 向一个飞书群发送一条消息。网络/飞书错误不抛,统一返回 { ok:false }。 */
export async function sendFeishu(target: FeishuTarget, payload: FeishuPayload): Promise<FeishuSendResult> {
  const body: Record<string, unknown> = { ...payload };
  if (target.secret) {
    const timestamp = Math.floor(Date.now() / 1000);
    body.timestamp = String(timestamp);
    body.sign = sign(target.secret, timestamp);
  }

  try {
    const res = await fetch(target.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      code?: number;
      msg?: string;
      StatusCode?: number;
      StatusMessage?: string;
    };
    const code = data.code ?? data.StatusCode ?? (res.ok ? 0 : res.status);
    const msg = data.msg ?? data.StatusMessage ?? (res.ok ? "success" : `HTTP ${res.status}`);
    return { ok: code === 0, code, msg };
  } catch (err) {
    return { ok: false, code: -1, msg: err instanceof Error ? err.message : "网络错误" };
  }
}
