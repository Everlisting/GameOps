"use client";

/**
 * 活动详情页操作区:状态切换 + 删除(仅 DRAFT)。
 * 转移规则:DRAFT → ONGOING;ONGOING → ENDED;ENDED 终态。
 * DRAFT 不再支持直接归档到 ENDED —— 需要先上线再结束,或直接删除。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActivityStatus } from "@prisma/client";
import { Play, Square, Trash2 } from "lucide-react";

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
} from "@/components/ui/alert-dialog";
import { ActivityBadge } from "@/app/(creator)/_components/StatusBadge";

const NEXT_STATUS: Record<
  ActivityStatus,
  { status: ActivityStatus; label: string; icon: React.ComponentType<{ className?: string }> }[]
> = {
  DRAFT: [{ status: "ONGOING", label: "上线", icon: Play }],
  ONGOING: [{ status: "ENDED", label: "结束", icon: Square }],
  ENDED: [],
};

export default function ActivityActions({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: ActivityStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function changeStatus(next: ActivityStatus) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/operator/activities/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "状态切换失败");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/operator/activities/${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.message ?? "删除失败");
        return;
      }
      setConfirmOpen(false);
      router.push("/operator/activities");
    } finally {
      setBusy(false);
    }
  }

  const transitions = NEXT_STATUS[status];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">当前状态</span>
        <ActivityBadge status={status} />
      </div>
      {(transitions.length > 0 || status === "DRAFT") && (
        <div className="flex flex-wrap items-center gap-2">
          {transitions.map((t) => (
            <Button
              key={t.status}
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => changeStatus(t.status)}
              disabled={busy}
            >
              <t.icon className="size-3.5" />
              {t.label}
            </Button>
          ))}
          {status === "DRAFT" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              删除
            </Button>
          )}
        </div>
      )}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除该草稿活动?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>
                  即将删除:<span className="font-medium text-foreground">{name}</span>
                </div>
                <div>此操作不可恢复。</div>
                {error && (
                  <div className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                    {error}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void destroy();
              }}
              disabled={busy}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {busy ? "删除中…" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
