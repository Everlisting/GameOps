"use client";

/**
 * 运行错误明细:点开 Dialog 显示一条 ErrorLog 的所有字段 + stack(默认折叠)+ fields JSON。
 * 只读展示;不提供未脱敏原始日志下载(docs/logging.md §12)。
 */
import * as React from "react";
import { Eye, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type LogRow = {
  id: string;
  time: string; // 已格式化
  level: string;
  service: string;
  environment: string;
  release: string | null;
  instanceId: string | null;
  module: string;
  event: string | null;
  msg: string;
  requestId: string | null;
  traceId: string | null;
  taskId: string | null;
  runId: string | null;
  userIdHash: string | null;
  errName: string | null;
  errMessage: string | null;
  errStack: string | null;
  errCode: string | null;
  fingerprint: string;
  fields: unknown;
};

export function LevelChip({ level }: { level: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
        level === "fatal"
          ? "bg-red-600 text-white"
          : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      )}
    >
      {level}
    </span>
  );
}

export default function LogDetailButton({ row }: { row: LogRow }) {
  const [showStack, setShowStack] = React.useState(false);
  const fieldsText = React.useMemo(() => {
    if (row.fields == null) return "";
    try {
      return JSON.stringify(row.fields, null, 2);
    } catch {
      return String(row.fields);
    }
  }, [row.fields]);

  const idRows: Array<[string, string | null]> = [
    ["requestId", row.requestId],
    ["traceId", row.traceId],
    ["taskId", row.taskId],
    ["runId", row.runId],
    ["userIdHash", row.userIdHash],
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Eye className="size-3.5" />
          详情
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LevelChip level={row.level} />
            <span className="font-mono text-sm">{row.module}</span>
            {row.event && (
              <span className="font-mono text-xs text-muted-foreground">{row.event}</span>
            )}
          </DialogTitle>
          <DialogDescription>{row.msg}</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">时间</dt>
          <dd className="font-mono tabular-nums">{row.time}</dd>
          <dt className="text-muted-foreground">来源</dt>
          <dd className="font-mono text-xs">
            {row.service} · {row.environment}
            {row.release ? ` · ${row.release}` : ""}
            {row.instanceId ? ` · ${row.instanceId}` : ""}
          </dd>
          <dt className="text-muted-foreground">fingerprint</dt>
          <dd className="font-mono text-xs">{row.fingerprint}</dd>

          {idRows.map(([k, v]) =>
            v ? (
              <React.Fragment key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="truncate font-mono text-xs">{v}</dd>
              </React.Fragment>
            ) : null,
          )}

          {(row.errName || row.errMessage || row.errCode) && (
            <>
              <dt className="text-muted-foreground">错误</dt>
              <dd>
                <span className="font-mono text-xs">{row.errName ?? "Error"}</span>
                {row.errCode && (
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">{row.errCode}</span>
                )}
                {row.errMessage && <div className="mt-0.5 text-xs">{row.errMessage}</div>}
              </dd>
            </>
          )}

          {row.errStack && (
            <>
              <dt className="self-start text-muted-foreground">stack</dt>
              <dd>
                <button
                  type="button"
                  onClick={() => setShowStack((s) => !s)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className={cn("size-3.5 transition-transform", showStack && "rotate-180")} />
                  {showStack ? "收起" : "展开"}堆栈
                </button>
                {showStack && (
                  <pre className="mt-1 max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
                    {row.errStack}
                  </pre>
                )}
              </dd>
            </>
          )}

          {fieldsText && (
            <>
              <dt className="self-start text-muted-foreground">fields</dt>
              <dd>
                <pre className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px]">
                  {fieldsText}
                </pre>
              </dd>
            </>
          )}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
