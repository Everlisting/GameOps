/**
 * API 层封装:统一错误处理 + 请求体校验 + 运行日志(requestId/ALS/完成日志)。
 */
import { z } from "zod";
import { AppError, badRequest } from "@/lib/errors";
import { createLogger, runWithLogContext } from "@/lib/logger";
import { normalizeRoute } from "@/lib/logger/normalize";

type Handler = (req: Request, ctx: { params?: Record<string, string> }) => Promise<Response> | Response;

const httpLog = createLogger("http");
// 可信反代可传入 x-request-id;不可信/超长/含非法字符则重新生成
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
// 成功(<400)完成日志的采样率;≥400 始终记录。见 docs/logging.md §5.1
const HTTP_SAMPLE_RATE = (() => {
  const n = Number(process.env.LOG_HTTP_SAMPLE_RATE);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 1;
})();

function resolveRequestId(req: Request): string {
  const raw = req.headers.get("x-request-id");
  return raw && REQUEST_ID_RE.test(raw) ? raw : crypto.randomUUID();
}

function logCompletion(status: number, durationMs: number, err: unknown): void {
  const base = { event: "http.request.completed", status, durationMs };
  if (status >= 500) httpLog.error("请求处理失败", { ...base, err, persist: true });
  else if (status >= 400) httpLog.warn("请求异常完成", { ...base, ...(err !== undefined ? { err } : {}) });
  else if (HTTP_SAMPLE_RATE >= 1 || Math.random() < HTTP_SAMPLE_RATE) httpLog.info("请求完成", base);
}

export function route(handler: Handler): Handler {
  return async (req, ctx) => {
    const requestId = resolveRequestId(req);
    let route = "";
    try { route = normalizeRoute(new URL(req.url).pathname); } catch { /* URL 解析失败则留空 */ }
    const started = Date.now();
    return runWithLogContext({ requestId, method: req.method, route }, async () => {
      let res: Response;
      let thrown: unknown;
      try { res = await handler(req, ctx ?? {}); }
      catch (err) { thrown = err; res = handleApiError(err); }
      try { res.headers.set("x-request-id", requestId); } catch { /* 不可变响应头则跳过 */ }
      logCompletion(res.status, Date.now() - started, thrown);
      return res;
    });
  };
}

export function handleApiError(err: unknown): Response {
  if (err instanceof AppError) {
    if (!err.expected) console.error("[AppError:INTERNAL]", err);
    return Response.json(err.toResponseBody(), { status: err.status });
  }
  if (err instanceof z.ZodError) {
    const e = badRequest("请求参数校验失败", err.flatten().fieldErrors);
    return Response.json(e.toResponseBody(), { status: e.status });
  }
  console.error("[UnhandledError]", err);
  return Response.json({ error: { code: "INTERNAL", message: "服务器内部错误" } }, { status: 500 });
}

export async function parseJson<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try { raw = await req.json(); }
  catch { throw badRequest("请求体不是合法 JSON"); }
  return schema.parse(raw);
}
