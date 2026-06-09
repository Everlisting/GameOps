/**
 * 创作者 TOP 8 排行(按 30 天总播放)。
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { DashboardData } from "../_lib/aggregate";

export function TopCard({
  creators,
  className,
}: {
  creators: DashboardData["topCreators"];
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <CardTitle>创作者 TOP 8 · 30D 播放</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {creators.length === 0 ? (
          <div className="grid h-full place-items-center text-xs text-muted-foreground">
            暂无 30 天播放数据
          </div>
        ) : (
          <ul className="space-y-1.5">
            {creators.map((c) => (
              <li
                key={c.creatorId}
                className="grid grid-cols-[2rem_1fr_auto] items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {String(c.rank).padStart(2, "0")}
                </span>
                <span className="flex items-center gap-2 truncate">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-sm border bg-background text-xs">
                    {initial(c.nickname)}
                  </span>
                  <span className="truncate">{c.nickname}</span>
                </span>
                <span className="font-mono text-xs tabular-nums">
                  {formatViews(c.views)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function initial(s: string): string {
  if (!s) return "·";
  return s.trim().charAt(0) || "·";
}

function formatViews(v: number): string {
  if (v >= 100_000_000) return (v / 100_000_000).toFixed(2) + "亿";
  if (v >= 10_000) return (v / 10_000).toFixed(1) + "万";
  return v.toLocaleString();
}
