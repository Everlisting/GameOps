"use client";

import { useState, type ComponentType, type SVGProps } from "react";
import { Check, Copy, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DouyinIcon, UidIcon } from "@/components/icons/creator-identity";
import { cn } from "@/lib/utils";

function CopyField({ label, value, icon: Icon, primary = false }: { label: string; value: string | null; icon: ComponentType<SVGProps<SVGSVGElement>>; primary?: boolean }) {
  const [feedback, setFeedback] = useState<"idle" | "copied" | "error">("idle");
  if (!value) return <span className="inline-flex items-center gap-1 px-1 py-0.5 text-xs">
    <Icon className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" focusable="false" />
    <span className="sr-only">{label}</span><span className="text-muted-foreground">—</span>
  </span>;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value!);
      setFeedback("copied");
    } catch {
      setFeedback("error");
    }
  }

  return <div className="flex max-w-full flex-col items-start">
    <Button type="button" variant="ghost" size="xs" className="group/copy h-auto max-w-full whitespace-normal px-1 py-0.5"
      aria-label={`复制${label}：${value}`} onClick={() => void copy()}
      onPointerLeave={() => setFeedback("idle")} onBlur={() => setFeedback("idle")}>
      <span className="inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/50" aria-hidden="true">
        <Icon className="size-3.5" focusable="false" />
      </span>
      <span className={cn("min-w-0 break-all text-left font-normal", primary ? "text-foreground" : "text-muted-foreground")}>{value}</span>
      {feedback === "copied"
        ? <Check data-icon="inline-end" className="opacity-0 text-muted-foreground/50 group-hover/copy:opacity-100 group-focus-visible/copy:opacity-100" />
        : <Copy data-icon="inline-end" className="opacity-0 text-muted-foreground/50 group-hover/copy:opacity-100 group-focus-visible/copy:opacity-100" />}
      <span className="sr-only" role="status">{feedback === "copied" ? "已复制" : feedback === "error" ? "复制失败，请检查剪贴板权限" : ""}</span>
    </Button>
    {feedback === "error" && <span role="alert" className="text-xs text-destructive">复制失败，请检查剪贴板权限</span>}
  </div>;
}

export default function AuthorIdentity({ name, uid, account }: { name: string; uid: string | null; account: string | null }) {
  return <div className="flex flex-col items-start justify-center gap-0.5">
    <CopyField label="昵称" value={name} icon={User} primary />
    <CopyField label="抖音号" value={account} icon={DouyinIcon} />
    <CopyField label="UID" value={uid} icon={UidIcon} />
  </div>;
}
