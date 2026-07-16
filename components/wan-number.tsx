"use client";

/**
 * 播放量类大数显示:≥10000 显示为「X.XX万」(除以一万,保留两位小数,四舍五入),
 * 鼠标移上去用 HoverCard 展示精确数字;不足一万显示原数字。
 * 用于视频/主播数据表的 播放量 / 推荐播放量 列。
 */
import * as React from "react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

const WAN = 10000;
const NUM_FMT = new Intl.NumberFormat("en-US");

export function WanNumber({ value }: { value: number }) {
  if (value < WAN) {
    return <span className="tabular-nums">{NUM_FMT.format(value)}</span>;
  }
  const wan = (value / WAN).toFixed(2); // 192000 → "19.20"
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <span className="cursor-default tabular-nums">{wan}万</span>
      </HoverCardTrigger>
      <HoverCardContent align="center" side="top" className="w-auto">
        <p className="text-xs tabular-nums select-text">{NUM_FMT.format(value)}</p>
      </HoverCardContent>
    </HoverCard>
  );
}
