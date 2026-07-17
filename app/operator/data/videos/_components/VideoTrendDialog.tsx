"use client";

/**
 * 视频播放趋势弹窗 · 站内 Dialog + 折线(recharts)。
 *
 * 点击表格「趋势」按钮打开;首次打开时才向
 * GET /api/operator/data/videos/[externalId]/trend 拉数据(懒加载,不阻塞列表)。
 * 双线:播放量 / 推荐播放量,按自然日展开。已删除/隐藏的视频不渲染此按钮(见表格列)。
 */
import * as React from "react";
import { LineChart as LineChartIcon } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

type Point = { date: string; views: number; recommendedViews: number };

const chartConfig = {
  views: { label: "播放量", color: "var(--chart-1)" },
  recommendedViews: { label: "推荐播放量", color: "var(--chart-2)" },
} satisfies ChartConfig;

export default function VideoTrendDialog({
  externalId,
  platform,
  publishedAt,
}: {
  externalId: string;
  platform: string;
  /** 视频发布时间(ISO);用于把曲线收窄到「发布之日 ~ 发布当月月底」 */
  publishedAt: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<Point[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open || data || loading) return;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ platform });
    if (publishedAt) qs.set("publishedAt", publishedAt);
    fetch(
      `/api/operator/data/videos/${encodeURIComponent(externalId)}/trend?${qs.toString()}`,
    )
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(body?.error?.message ?? "加载失败");
        }
        return r.json() as Promise<{ series: Point[] }>;
      })
      .then((j) => setData(j.series))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [open, data, loading, externalId, platform, publishedAt]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="查看播放趋势"
          className="mx-auto inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-primary"
        >
          <LineChartIcon className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl grid-cols-1">
        <DialogHeader className="min-w-0">
          <DialogTitle>播放趋势</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            加载中…
          </div>
        ) : error ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-destructive">
            {error}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex h-[300px] flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
            <span>暂无历史快照</span>
            <span className="text-xs">
              每次导入 / 采集会留一份当日快照,多次导入后这里才有趋势。
            </span>
          </div>
        ) : data.length < 2 ? (
          // 只有 1 天快照:画不出曲线(单点会错位),直接展示该日数值 + 说明
          <div className="flex h-[300px] flex-col items-center justify-center gap-4">
            <p className="text-sm text-muted-foreground">
              目前只有 1 天快照,趋势曲线至少需要 2 天数据
            </p>
            <div className="flex divide-x rounded-lg border">
              <div className="px-8 py-4 text-center">
                <div className="text-xs text-muted-foreground">播放量</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {data[0].views.toLocaleString()}
                </div>
              </div>
              <div className="px-8 py-4 text-center">
                <div className="text-xs text-muted-foreground">推荐播放量</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {data[0].recommendedViews.toLocaleString()}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              快照日期 {data[0].date} · 每次导入 / 采集留一份当日快照,多天后即可看到曲线
            </p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
            <LineChart accessibilityLayer data={data} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(v) => {
                  const d = new Date(v as string);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) =>
                      new Date(value as string).toLocaleDateString("zh-CN", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    }
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                dataKey="views"
                type="monotone"
                stroke="var(--color-views)"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
              <Line
                dataKey="recommendedViews"
                type="monotone"
                stroke="var(--color-recommendedViews)"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </DialogContent>
    </Dialog>
  );
}
