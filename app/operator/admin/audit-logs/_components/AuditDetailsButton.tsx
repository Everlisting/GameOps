"use client";

/**
 * 审计明细按钮:点开 Dialog 显示一条 AuditLog 的所有字段 + details JSON。
 * details 用 pretty-printed <pre> 展示,长字符串/数组/对象都能看清。
 */
import * as React from "react";
import { Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { describeAction, TARGET_TYPE_LABEL } from "../labels";

export type AuditRow = {
  id: string;
  time: string; // 已经 toLocaleString
  actorUsername: string;
  isSystem: boolean;
  action: string;
  targetType: string;
  targetId: string | null;
  details: unknown;
};

export default function AuditDetailsButton({ row }: { row: AuditRow }) {
  const a = describeAction(row.action);
  const targetLabel = TARGET_TYPE_LABEL[row.targetType] ?? row.targetType;
  const detailsText = React.useMemo(() => {
    if (row.details == null) return "";
    try {
      return JSON.stringify(row.details, null, 2);
    } catch {
      return String(row.details);
    }
  }, [row.details]);

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
          <DialogTitle>审计明细</DialogTitle>
          <DialogDescription>
            {a.label} · {targetLabel}
            {row.targetId ? ` · ${row.targetId}` : ""}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">时间</dt>
          <dd className="font-mono tabular-nums">{row.time}</dd>
          <dt className="text-muted-foreground">操作人</dt>
          <dd>{row.isSystem ? "系统(cron)" : row.actorUsername}</dd>
          <dt className="text-muted-foreground">动作</dt>
          <dd>
            {a.label}
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              {row.action}
            </span>
          </dd>
          <dt className="text-muted-foreground">目标</dt>
          <dd>
            {targetLabel}
            {row.targetId && (
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {row.targetId}
              </span>
            )}
          </dd>
          <dt className="self-start text-muted-foreground">详情</dt>
          <dd>
            {detailsText ? (
              <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
                {detailsText}
              </pre>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
