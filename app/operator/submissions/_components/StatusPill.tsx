/**
 * 三子状态(标题/内容/易闪)统一小标签。
 * 与最终态 SubmissionBadge 分开,避免视觉混淆。
 */
import type { ReviewStatus } from "@prisma/client";

import { cn } from "@/lib/utils";

const STYLE: Record<
  ReviewStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: "待审",
    className:
      "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  },
  APPROVED: {
    label: "通过",
    className:
      "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
  },
  REJECTED: {
    label: "未过",
    className:
      "bg-red-500/15 text-red-700 ring-red-500/30 dark:text-red-300",
  },
};

export function ReviewPill({
  status,
  label,
}: {
  status: ReviewStatus;
  label: string;
}) {
  const s = STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
        s.className,
      )}
      title={`${label}:${s.label}`}
    >
      <span className="opacity-70">{label}</span>
      {s.label}
    </span>
  );
}
