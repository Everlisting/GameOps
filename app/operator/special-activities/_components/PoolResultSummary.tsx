"use client";

import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import type { VideoPoolResult } from "@/lib/special-activities/pool-details";

type AuthorPoolAmount = { name: string; paidCents: number; suppressed: boolean };
const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;

function PoolDetails({ title, label, total, children }: { title: string; label: string; total: number; children: ReactNode }) {
  const titleId = useId();
  return <Popover>
    <PopoverTrigger asChild><Button variant="link" size="xs" className="h-6 max-w-full justify-start px-0" aria-label={label}>查看全部 · {total} 个奖池</Button></PopoverTrigger>
    <PopoverContent align="start" collisionPadding={16} aria-labelledby={titleId}
      className="max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-2rem)] gap-3 overflow-hidden p-4 shadow-none">
      <PopoverHeader className="shrink-0">
        <PopoverTitle id={titleId} role="heading" aria-level={3}>{title}</PopoverTitle>
        <PopoverDescription>共 {total} 个奖池，按活动配置顺序展示。</PopoverDescription>
      </PopoverHeader>
      <div tabIndex={0} role="region" aria-label={`${title}列表`}
        className="no-scrollbar min-h-0 max-h-72 overflow-y-auto overscroll-contain rounded-sm focus-visible:outline focus-visible:outline-ring">
        {children}
      </div>
    </PopoverContent>
  </Popover>;
}

export function AuthorPoolAmounts({ authorName, pools }: { authorName: string; pools: AuthorPoolAmount[] }) {
  if (!pools.length) return <span className="text-xs text-muted-foreground">暂无奖池</span>;
  return <div className="flex min-w-0 flex-col items-start gap-1 text-xs">
    {pools.slice(0, 2).map((pool, index) => <div key={index} className="flex w-full min-w-0 items-center gap-2">
      <span className="min-w-0 truncate">{pool.name}</span>
      <span className="shrink-0 tabular-nums">{money(pool.paidCents)}{pool.suppressed && "（互斥）"}</span>
    </div>)}
    <PoolDetails title="各奖池金额" label={`查看${authorName}的全部奖池金额`} total={pools.length}>
      <ul className="flex flex-col divide-y divide-border">{pools.map((pool, index) => <li key={index} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
        <span className="min-w-0 break-words">{pool.name}</span>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-medium tabular-nums">{money(pool.paidCents)}</span>
          {pool.suppressed && <span className="text-xs text-muted-foreground">互斥未计奖</span>}
        </div>
      </li>)}</ul>
    </PoolDetails>
  </div>;
}

export function VideoPoolResults({ videoId, pools }: { videoId: string; pools: VideoPoolResult[] }) {
  if (!pools.length) return <span className="text-xs text-muted-foreground">暂无奖池</span>;
  const counts = { awarded: 0, suppressed: 0, unmatched: 0 };
  for (const pool of pools) counts[pool.status]++;
  return <div className="flex min-w-0 flex-col items-start gap-1 text-xs">
    <p className="whitespace-nowrap">参与计奖 {counts.awarded} 个</p>
    <p className="whitespace-nowrap text-muted-foreground">互斥 {counts.suppressed} · 未命中 {counts.unmatched}</p>
    <PoolDetails title="稿件奖池结果" label={`查看作品${videoId}的全部奖池结果`} total={pools.length}>
      <ul className="flex flex-col divide-y divide-border">{pools.map((pool, index) => <li key={index} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
        <p className="break-words font-medium">{pool.name}</p>
        <p className="break-words text-xs text-muted-foreground">{pool.reason}</p>
      </li>)}</ul>
    </PoolDetails>
  </div>;
}
