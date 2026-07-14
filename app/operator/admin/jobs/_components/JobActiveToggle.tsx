"use client";

/**
 * 任务「启用 / 停用」快捷切换按钮(独立于 cron 定时开关)。
 * 停用后该任务任何方式都不可触发(手动 / rerun / cron)。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";

export default function JobActiveToggle({
  jobId,
  active,
  canToggle = true,
}: {
  jobId: string;
  active: boolean;
  /** false 时只显示状态徽章、不可点(非 ADMIN;PATCH 需要 ADMIN)。 */
  canToggle?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!canToggle) {
    return active ? (
      <Badge variant="success">启用</Badge>
    ) : (
      <Badge variant="muted">停用</Badge>
    );
  }

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={active ? "点击停用该任务" : "点击启用该任务"}
      className="inline-flex items-center gap-1 disabled:opacity-50"
    >
      {active ? (
        <Badge variant="success">启用</Badge>
      ) : (
        <Badge variant="muted">停用</Badge>
      )}
      <span className="text-[10px] text-muted-foreground underline-offset-2 hover:underline">
        {busy ? "…" : active ? "停用" : "启用"}
      </span>
    </button>
  );
}
