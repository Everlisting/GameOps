"use client";

/**
 * Cron 表达式输入框 + 下一次执行时间预览。
 * 输入合法时调 /api/admin/cron-preview 拿 next。
 */
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";

export default function CronExpressionInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [nextRun, setNextRun] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!value.trim()) {
      setNextRun(null);
      setErr(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          "/api/admin/cron-preview?expr=" + encodeURIComponent(value.trim()),
        );
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.nextRunAt) {
          setNextRun(data.nextRunAt);
          setErr(null);
        } else {
          setNextRun(null);
          setErr(data.error?.message ?? "表达式非法");
        }
      } catch {
        if (!cancelled) {
          setNextRun(null);
          setErr("预览失败");
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value]);

  return (
    <div className="space-y-1.5">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0 3 * * *  (每天 03:00)"
        className="font-mono"
      />
      <p className="text-[11px] text-muted-foreground">
        标准 5 段 cron(m h dom mon dow);留空表示仅手动触发。时区:Asia/Shanghai。
      </p>
      {value.trim() &&
        (nextRun ? (
          <p className="text-[11px] text-emerald-600">
            下次执行:{new Date(nextRun).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" })}
          </p>
        ) : err ? (
          <p className="text-[11px] text-destructive">{err}</p>
        ) : null)}
    </div>
  );
}
