"use client";

/**
 * 折叠日志区:
 *   - 默认折叠,不发请求,首屏渲染零成本
 *   - 展开后拉一次 `?lines=100`(尾 100 行)
 *   - "加载更早" 用 `?tail=<currentSize+512KB>` 多拉一段,前置
 *   - "下载完整日志" 直接走 `?download=1` 浏览器下载
 *   - 任务还在 RUNNING/PENDING 时,展开状态下每 3 秒增量拉一次(尾 100 行)
 */
import * as React from "react";
import { ChevronDown, Download, RefreshCw } from "lucide-react";
import type { CrawlerTaskStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const DEFAULT_TAIL_LINES = 100;
const LOAD_MORE_CHUNK = 512 * 1024;
const POLL_MS = 3000;

type Props = {
  taskId: string;
  initialStatus: CrawlerTaskStatus;
  hasLog: boolean;
  /** 暂未用,预留权限信息 */
  isAdmin: boolean;
};

export default function LogSection({ taskId, initialStatus, hasLog }: Props) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState<string>("");
  const [size, setSize] = React.useState(0);
  const [status, setStatus] = React.useState<CrawlerTaskStatus>(initialStatus);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasMoreBefore, setHasMoreBefore] = React.useState(false);
  const preRef = React.useRef<HTMLPreElement>(null);

  const isLive = status === "RUNNING" || status === "PENDING";

  const fetchLines = React.useCallback(
    async (lines: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/tasks/${taskId}/log?lines=${lines}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.text();
        const total = Number(res.headers.get("X-Log-Size") || "0");
        const s = (res.headers.get("X-Log-Status") || initialStatus) as CrawlerTaskStatus;
        setText(body);
        setSize(total);
        setStatus(s);
        setHasMoreBefore(body.length < total);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [taskId, initialStatus],
  );

  const loadMoreBefore = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 把当前拿到的字节数当作"想要"的最小尾部长度,再 +chunk 往前扩
      const wantBytes = new TextEncoder().encode(text).length + LOAD_MORE_CHUNK;
      const res = await fetch(
        `/api/admin/tasks/${taskId}/log?tail=${wantBytes}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      const total = Number(res.headers.get("X-Log-Size") || "0");
      setText(body);
      setSize(total);
      setHasMoreBefore(new TextEncoder().encode(body).length < total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [taskId, text]);

  // 首次展开:拉尾 100 行
  React.useEffect(() => {
    if (!open || !hasLog) return;
    if (text === "") void fetchLines(DEFAULT_TAIL_LINES);
  }, [open, hasLog, text, fetchLines]);

  // RUNNING 时每 3s 增量刷一次尾 100 行
  React.useEffect(() => {
    if (!open || !hasLog || !isLive) return;
    const id = setInterval(() => {
      void fetchLines(DEFAULT_TAIL_LINES);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [open, hasLog, isLive, fetchLines]);

  // 自动滚到底(仅 RUNNING 状态)
  React.useEffect(() => {
    if (!preRef.current || !isLive) return;
    preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [text, isLive]);

  if (!hasLog) {
    return (
      <div>
        <h2 className="text-sm font-medium">执行日志</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          这次执行还没产生日志(或日志文件已被清理)。
        </p>
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="-ml-2">
            <ChevronDown
              className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
            <span className="text-sm font-medium">
              执行日志{size > 0 && ` (${formatBytes(size)})`}
            </span>
          </Button>
        </CollapsibleTrigger>
        {open && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={() => void fetchLines(DEFAULT_TAIL_LINES)}
              title="重新拉尾 100 行"
            >
              <RefreshCw className="size-3.5" />
              刷新
            </Button>
            <Button asChild variant="outline" size="sm">
              <a
                href={`/api/admin/tasks/${taskId}/log?download=1`}
                download={`task-${taskId}.log`}
              >
                <Download className="size-3.5" />
                下载完整
              </a>
            </Button>
          </div>
        )}
      </div>

      <CollapsibleContent className="mt-3 space-y-2">
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
            日志加载失败:{error}
          </p>
        )}

        {hasMoreBefore && (
          <div className="text-center">
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={loadMoreBefore}
            >
              加载更早
            </Button>
          </div>
        )}

        <pre
          ref={preRef}
          className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed"
        >
          {text || (loading ? "加载中…" : "(空)")}
        </pre>

        {isLive && (
          <p className="text-center text-[11px] text-muted-foreground">
            任务进行中,每 {POLL_MS / 1000}s 自动刷新尾 {DEFAULT_TAIL_LINES} 行
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
