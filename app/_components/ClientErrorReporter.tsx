"use client";

/**
 * 前端未捕获错误上报(日志系统阶段5)。全局挂 error / unhandledrejection,
 * 上报到 /api/client-log(beacon 式,失败静默)。会话内去重 + 上限,防风暴(与服务端限流互为防线)。
 */
import { useEffect } from "react";

const MAX_PER_SESSION = 20;

export default function ClientErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const seen = new Set<string>();

    function report(payload: {
      kind: "error" | "unhandledrejection";
      message: string;
      stack?: string;
      source?: string;
      line?: number;
      col?: number;
    }) {
      if (sent >= MAX_PER_SESSION || !payload.message) return;
      const key = `${payload.message}|${payload.source ?? ""}|${payload.line ?? ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      sent++;
      try {
        void fetch("/api/client-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, page: location.pathname }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* 上报本身绝不影响页面 */
      }
    }

    function onError(e: ErrorEvent) {
      report({
        kind: "error",
        message: String(e.message || "error").slice(0, 2000),
        stack: e.error instanceof Error ? e.error.stack?.slice(0, 8000) : undefined,
        source: e.filename ? String(e.filename).slice(0, 1000) : undefined,
        line: typeof e.lineno === "number" ? e.lineno : undefined,
        col: typeof e.colno === "number" ? e.colno : undefined,
      });
    }

    function onRejection(e: PromiseRejectionEvent) {
      const r: unknown = e.reason;
      const message = r instanceof Error ? r.message : String(r);
      report({
        kind: "unhandledrejection",
        message: message.slice(0, 2000),
        stack: r instanceof Error ? r.stack?.slice(0, 8000) : undefined,
      });
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
