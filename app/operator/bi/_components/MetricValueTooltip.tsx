"use client";

import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function MetricValueTooltip({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          role="group"
          aria-label={`${label}：${value}`}
          className="h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="tabular-nums motion-reduce:data-[state=delayed-open]:animate-none motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none"
      >
        {value}
      </TooltipContent>
    </Tooltip>
  );
}
