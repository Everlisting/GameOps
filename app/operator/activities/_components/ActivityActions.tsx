"use client";

/**
 * 活动详情页操作区:状态切换 + 删除(仅 DRAFT)。
 * 转移规则:DRAFT → ONGOING / ENDED;ONGOING → ENDED;ENDED 终态。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActivityStatus } from "@prisma/client";
import { Play, Square, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ActivityBadge } from "@/app/(creator)/_components/StatusBadge";

const NEXT_STATUS: Record<
  ActivityStatus,
  { status: ActivityStatus; label: string; icon: React.ComponentType<{ className?: string }> }[]
> = {
  DRAFT: [
    { status: "ONGOING", label: "上线", icon: Play },
    { status: "ENDED", label: "归档", icon: Square },
  ],
  ONGOING: [{ status: "ENDED", label: "结束", icon: Square }],
  ENDED: [],
};

export default function ActivityActions({
  id,
  status,
}: {
  id: string;
  status: ActivityStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!confirm("确认删除该草稿活动?此操作不可恢复。")) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/operator/activities/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "删除失败");
        return;
      }
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
              onClick={destroy}
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
    </div>
  );
}
