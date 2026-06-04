/**
 * API 层封装:统一错误处理 + 请求体校验。
 */
import { z } from "zod";
import { AppError, badRequest } from "@/lib/errors";

type Handler = (req: Request, ctx: { params?: Record<string, string> }) => Promise<Response> | Response;

export function route(handler: Handler): Handler {
  return async (req, ctx) => {
    try { return await handler(req, ctx ?? {}); }
    catch (err) { return handleApiError(err); }
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
