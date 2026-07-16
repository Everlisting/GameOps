"use client";

/**
 * 昵称等短文本的截断显示:最多显示 MAX_CHARS 个字,超出用「…」省略,
 * 鼠标移上去用 HoverCard 展示完整内容。用于视频/主播/直播三张表的「主播昵称」列。
 */
import * as React from "react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

const MAX_CHARS = 7;

export function TruncatedName({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const chars = Array.from(value);
  if (chars.length <= MAX_CHARS) {
    return <span className={className}>{value}</span>;
  }
  const short = chars.slice(0, MAX_CHARS).join("") + "…";
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <span className={cn("cursor-default", className)}>{short}</span>
      </HoverCardTrigger>
      <HoverCardContent align="center" side="top" className="w-auto max-w-[280px]">
        <p className="text-xs leading-relaxed break-words whitespace-pre-wrap select-text">
          {value}
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}
