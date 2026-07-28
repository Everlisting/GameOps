/**
 * POST /api/client-log — 前端错误上报(日志系统阶段5,docs/logging.md §14)。
 *
 * 前端日志是**不可信输入**,不直接转发 logger/ErrorLog:
 *  - Zod strict 白名单:拒绝未知键 → 无法伪造 level/persist/module/userId。
 *  - 同源校验(Origin) + 每 IP 限流 + 请求体大小上限。
 *  - message/stack/source 脱敏 + 限长;固定 module="client"、级别 warn、**不 persist**(不进 ErrorLog)。
 *  - UA/浏览器类别、route 由服务端从请求头/入参推导,不信客户端自报身份字段。
 * 不接鉴权(错误可能发生在登录前);不包 route()(避免每条上报都产生 http 完成日志)。
 */
import { createHash } from "node:crypto";

import { z } from "zod";

import { createLogger } from "@/lib/logger";
import { scrubString, clampString } from "@/lib/logger/redact";
import { env } from "@/lib/validation/env";

export const runtime = "nodejs";

const log = createLogger("client");

const schema = z
  .object({
    kind: z.enum(["error", "unhandledrejection"]).default("error"),
    message: z.string().min(1).max(2000),
    stack: z.string().max(8000).optional(),
    source: z.string().max(1000).optional(),
    line: z.number().int().nonnegative().max(10_000_000).optional(),
    col: z.number().int().nonnegative().max(10_000_000).optional(),
    page: z.string().max(1000).optional(),
  })
  .strict();

// ── 每 IP 限流(内存,单实例;best-effort)──────────────────────────────
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const buckets = new Map<string, { count: number; resetAt: number }>();

function allow(ip: string): boolean {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(ip, b);
  }
  b.count++;
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
  }
  return b.count <= MAX_PER_WINDOW;
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function browserClass(ua: string): string {
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "Other";
}

/** 归一化前端路由(去 query,cuid/数字段替换 :id)供聚合。 */
function normalizePage(page: string | undefined): string | undefined {
  if (!page) return undefined;
  const path = page.split("?")[0]!.split("#")[0]!;
  return path
    .split("/")
    .map((s) => (/^c[a-z0-9]{20,}$/i.test(s) || /^\d+$/.test(s) ? ":id" : s))
    .join("/")
    .slice(0, 300);
}

const EMPTY = new Response(null, { status: 204 });

export async function POST(req: Request): Promise<Response> {
  try {
    // 同源校验:Origin 存在则必须匹配应用域名
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(env.NEXT_PUBLIC_APP_URL).origin) {
      return new Response(null, { status: 403 });
    }
    // 体积上限
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > 16_384) return new Response(null, { status: 413 });
    // 限流
    if (!allow(clientIp(req))) return new Response(null, { status: 429 });

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return new Response(null, { status: 400 });
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return new Response(null, { status: 400 });
    const b = parsed.data;

    const message = clampString(scrubString(b.message), 2000).value;
    const stack = b.stack ? clampString(scrubString(b.stack), 8000).value : undefined;
    const source = b.source ? clampString(scrubString(b.source), 1000).value : undefined;
    const route = normalizePage(b.page);
    const fingerprint = createHash("sha256")
      .update([message, source ?? "", b.line ?? ""].join("|"))
      .digest("hex")
      .slice(0, 16);

    // 固定 module=client、warn、不 persist(不进 ErrorLog);身份由服务端推导
    log.warn("前端错误", {
      event: "client.error",
      kind: b.kind,
      fingerprint,
      route,
      source,
      line: b.line,
      col: b.col,
      browser: browserClass(req.headers.get("user-agent") ?? ""),
      clientMessage: message,
      clientStack: stack,
    });
    return EMPTY;
  } catch (err) {
    log.error("client-log 处理失败", { event: "client.ingest_failed", err });
    return new Response(null, { status: 500 });
  }
}
