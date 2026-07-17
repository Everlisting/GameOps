"use client";

/**
 * 右侧榜单:顶部一个分段开关切换「主播 TOP30」(按总播放)/「作品 TOP30」(按单作品播放),
 * 一次只显示一份。榜单纵向循环滚动(内容复制两份 + CSS translateY(-50%) 无缝循环),悬停暂停。
 * 主播只显示 名称 + 播放量;作品显示 标题(过长截断)+ 播放量。
 */
import * as React from "react";
import { useRouter } from "next/navigation";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { DashboardData } from "../_lib/aggregate";

type Tab = "anchor" | "video";

export function TopCard({
  anchors,
  videos,
  className,
}: {
  anchors: DashboardData["topAnchors"];
  videos: DashboardData["topVideos"];
  className?: string;
}) {
  const [tab, setTab] = React.useState<Tab>("anchor");
  const router = useRouter();

  // 点击主播 → 视频数据页,按该主播搜索(沿用视频页「本月默认」);
  // keepFilters 让全局重置组件放行这次带来的筛选
  const gotoAnchor = (search: string) => {
    const params = new URLSearchParams({ q: search, keepFilters: "1" });
    router.push(`/operator/data/videos?${params.toString()}`);
  };

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-xs">
          {(
            [
              ["anchor", "主播 TOP30"],
              ["video", "作品 TOP30"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              data-active={tab === key}
              className="rounded-md px-2 py-1.5 font-medium text-muted-foreground transition-colors data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-sm"
            >
              {label}
            </button>
          ))}
        </div>
      </CardHeader>
      {/* flex-1 让卡片高度沿用同行趋势卡(不被榜单内容撑高);
          滚动内容绝对定位脱离流,填满后由 overflow-hidden 裁剪 */}
      <CardContent className="relative flex-1 p-0">
        <div className="absolute inset-0 overflow-hidden px-6 pb-6">
          {tab === "anchor" ? (
            <LoopList
              key="anchor"
              items={anchors}
              emptyText="暂无主播数据"
              renderItem={(a) => (
                <Row
                  rank={a.rank}
                  label={a.name}
                  views={a.views}
                  onClick={() => gotoAnchor(a.search)}
                />
              )}
            />
          ) : (
            <LoopList
              key="video"
              items={videos}
              emptyText="暂无作品数据"
              renderItem={(v) => (
                <Row rank={v.rank} label={v.title} views={v.views} href={v.url} />
              )}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** 纵向循环滚动:items 复制两份,匀速上移一份高度后无缝回到起点。父容器负责 overflow-hidden。 */
function LoopList<T>({
  items,
  renderItem,
  emptyText,
}: {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  emptyText: string;
}) {
  const [paused, setPaused] = React.useState(false);

  if (items.length === 0) {
    return (
      <div className="grid h-full place-items-center text-xs text-muted-foreground">
        {emptyText}
      </div>
    );
  }
  // 匀速:每行约 1.2s,给个下限避免行数少时滚太快
  const duration = Math.max(15, items.length * 1.2);
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      // 用 longhand 逐项设置,避免 animation 简写把 play-state 覆盖,导致悬停暂停失效
      style={{
        animationName: "bi-loop-scroll",
        animationDuration: `${duration}s`,
        animationTimingFunction: "linear",
        animationIterationCount: "infinite",
        animationPlayState: paused ? "paused" : "running",
      }}
    >
      {items.map((it, i) => (
        <div key={i} className="mb-1.5">
          {renderItem(it)}
        </div>
      ))}
      {items.map((it, i) => (
        <div key={`dup-${i}`} className="mb-1.5" aria-hidden>
          {renderItem(it)}
        </div>
      ))}
    </div>
  );
}

function Row({
  rank,
  label,
  views,
  onClick,
  href,
}: {
  rank: number;
  label: string;
  views: number;
  onClick?: () => void;
  /** 外链(作品跳抖音);为空则不可点 */
  href?: string;
}) {
  const cls =
    "grid grid-cols-[1.75rem_1fr_auto] items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs transition-colors hover:bg-muted hover:shadow-sm";
  const inner = (
    <>
      <span className="font-mono text-muted-foreground">
        {String(rank).padStart(2, "0")}
      </span>
      <span className="min-w-0 truncate">{label}</span>
      <span className="font-mono tabular-nums text-muted-foreground">
        {formatViews(views)}
      </span>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(cls, "cursor-pointer")}
      >
        {inner}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(cls, "w-full cursor-pointer text-left")}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function formatViews(v: number): string {
  if (v >= 100_000_000) return (v / 100_000_000).toFixed(2) + "亿";
  if (v >= 10_000) return (v / 10_000).toFixed(1) + "万";
  return v.toLocaleString();
}
