"use client";

/**
 * 创作者账户状态切换按钮组。
 * pending → active(通过) / disabled(拒绝)
 * active  → disabled(停用)
 * disabled → active(启用)
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pause, Play, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AccountStatusBadge } from "./AccountStatusBadge";

type Status = "pending" | "active" | "disabled";

export default function CreatorActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: Status) {
    if (
      (status === "active" && next === "disabled") ||
      (status === "pending" && next === "disabled")
    ) {
      const msg =
        status === "pending"
          ? "确认拒绝该创作者注册申请?账号会被置为停用。"
          : "确认停用该创作者?停用后无法登录,直到再次启用。";
      if (!confirm(msg)) return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/operator/creators/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "操作失败");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">账户状态</span>
        <AccountStatusBadge status={status} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {status === "pending" && (
          <>
            <Button
              size="sm"
              onClick={() => setStatus("active")}
              disabled={busy}
            >
              <Check className="size-3.5" />
              通过审核
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatus("disabled")}
              disabled={busy}
              className="text-destructive hover:text-destructive"
            >
              <X className="size-3.5" />
              拒绝
            </Button>
          </>
        )}
        {status === "active" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setStatus("disabled")}
            disabled={busy}
            className="text-destructive hover:text-destructive"
          >
            <Pause className="size-3.5" />
            停用账户
          </Button>
        )}
        {status === "disabled" && (
          <Button
            size="sm"
            onClick={() => setStatus("active")}
            disabled={busy}
          >
            <Play className="size-3.5" />
            重新启用
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
