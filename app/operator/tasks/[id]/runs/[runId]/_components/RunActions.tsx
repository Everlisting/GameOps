"use client";

/**
 * 执行详情页头部操作:
 *   - RUNNING / PENDING:停止(PATCH status=CANCELED,带二次确认 modal)
 *   - FAILED / CANCELED:重排队(PATCH status=PENDING)+ 重跑(POST rerun 建新 task)
 *   - SUCCEEDED:重跑
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Square } from "lucide-react";
import type { CrawlerTaskStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function RunActions({
  jobId,
  taskId,
  status,
  hasJob,
}: {
  jobId: string;
  taskId: string;
  status: CrawlerTaskStatus;
  hasJob: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function call(
    url: string,
    method: "POST" | "PATCH",
    body?: object,
    onSuccess?: (data: unknown) => void,
  ) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `失败 (HTTP ${res.status})`);
      onSuccess?.(data);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const canStop = status === "RUNNING" || status === "PENDING";
  const canRerun = hasJob && (status === "SUCCEEDED" || status === "FAILED" || status === "CANCELED");
  const canRequeue = status === "FAILED" || status === "CANCELED";

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {canStop && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={busy}>
                <Square className="size-3.5" />
                停止
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>停止这次执行?</AlertDialogTitle>
                <AlertDialogDescription>
                  {status === "RUNNING"
                    ? "Agent 会在数秒内 kill 子进程。已经写出的产物不会回滚;已经发出的飞书 / 外部副作用也无法撤销。"
                    : "任务还未被 Agent 领取,直接置为 CANCELED 不影响其它任务。"}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
                <AlertDialogAction
                  disabled={busy}
                  className={cn(buttonVariants({ variant: "destructive" }))}
                  onClick={() =>
                    call(`/api/admin/tasks/${taskId}`, "PATCH", {
                      status: "CANCELED",
                    })
                  }
                >
                  确认停止
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {canRequeue && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              call(`/api/admin/tasks/${taskId}`, "PATCH", { status: "PENDING" })
            }
          >
            重新排队(同一 task)
          </Button>
        )}
        {canRerun && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              call(
                `/api/operator/tasks/${taskId}/rerun`,
                "POST",
                undefined,
                (data) => {
                  const d = data as { id?: string };
                  if (d?.id) {
                    router.push(`/operator/tasks/${jobId}/runs/${d.id}`);
                  }
                },
              )
            }
          >
            重跑(克隆新 task)
          </Button>
        )}
      </div>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
