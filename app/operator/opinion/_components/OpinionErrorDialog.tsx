"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { OpinionTaskItem } from "./OpinionTaskTable";

export function OpinionErrorDialog({
  item,
  onClose,
}: {
  item: OpinionTaskItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!item} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>报告生成失败</DialogTitle>
          <DialogDescription>
            {item?.task_id} · {item?.scope} · {item?.game}
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed">
          {item?.error_message ?? "—"}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
