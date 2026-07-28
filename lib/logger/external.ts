/**
 * 出站 HTTP 调用的安全日志(module=external)。见 docs/logging.md §7。
 * 只记 service/operation/status(或供应商 code)/duration;绝不记 URL 明文、Authorization、apiKey、请求体。
 */
import { createLogger } from "@/lib/logger";

const extLog = createLogger("external");

/**
 * 包装一次 fetch:按 HTTP 状态记 external.call.completed/failed,网络错误记 failed 后原样抛出。
 * 适用于以 HTTP 状态判成败的服务(如舆情分析服务)。不记 input URL(可能含敏感参数)。
 */
export async function loggedFetch(
  service: string,
  operation: string,
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const started = Date.now();
  const method = init?.method ?? "GET";
  try {
    const res = await fetch(input, init);
    const fields = {
      event: "external.call.completed",
      peer: service, // 被调方(避免与基础字段 service=本应用身份 冲突)
      operation,
      method,
      status: res.status,
      durationMs: Date.now() - started,
    };
    if (res.status >= 500) extLog.error("外部调用失败", { ...fields, persist: true });
    else if (res.status >= 400) extLog.warn("外部调用异常", fields);
    else extLog.info("外部调用完成", fields);
    return res;
  } catch (err) {
    extLog.error("外部调用不可达", {
      event: "external.call.failed",
      peer: service,
      operation,
      method,
      durationMs: Date.now() - started,
      err,
      persist: true,
    });
    throw err;
  }
}

/**
 * 记一次以「响应体状态码」判成败的外部调用(如飞书:HTTP 200 但 body.code!==0)。
 * 成功记 debug(降噪),失败记 warn;code/detail 进 fields 桶脱敏限长。
 */
export function logExternalResult(
  service: string,
  operation: string,
  r: { ok: boolean; code?: number | string; detail?: string; durationMs?: number },
): void {
  const fields = {
    event: r.ok ? "external.call.completed" : "external.call.failed",
    peer: service, // 被调方(避免与基础字段 service 冲突)
    operation,
    code: r.code,
    durationMs: r.durationMs,
    detail: r.detail,
  };
  if (r.ok) extLog.debug("外部调用完成", fields);
  else extLog.warn("外部调用失败", fields);
}
