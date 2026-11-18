"use client";

import Link from "next/link";
import { ArrowUpRight, Trophy } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { creatorMonthVideosHref } from "@/lib/data-period";
import type { DashboardData } from "../_lib/aggregate";
import { compact } from "../_lib/format";

export function TopCard({
  authors,
  videos,
  range,
}: {
  authors: DashboardData["topAuthors"];
  videos: DashboardData["topVideos"];
  range: DashboardData["range"];
}) {
  return (
    <Card className="h-full min-w-0">
      <CardHeader className="flex-row items-start justify-between gap-3 p-4 pb-2">
        <div className="flex flex-col gap-2">
          <CardTitle>传播排行榜</CardTitle>
          <CardDescription>按所选作品的最新累计播放量排序</CardDescription>
        </div>
        <Badge variant="secondary">
          <Trophy className="size-3" aria-hidden="true" />
          TOP 10
        </Badge>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <Tabs defaultValue="authors" className="gap-3">
          <TabsList className="w-full min-h-11 sm:w-64" aria-label="排行类型">
            <TabsTrigger value="authors">达人榜</TabsTrigger>
            <TabsTrigger value="videos">作品榜</TabsTrigger>
          </TabsList>
          <TabsContent value="authors">
            <div className="flex items-center justify-between px-2 pb-2 text-xs text-muted-foreground">
              <span>排名 / 达人</span>
              <span>作品数 · 累计播放</span>
            </div>
            <div
              className="max-h-40 overflow-y-auto overscroll-contain"
              tabIndex={0}
              role="region"
              aria-label="达人播放量前十名"
            >
              {authors.length ? (
                authors.map((author, index) => (
                  <Link
                    key={`${author.platform}:${author.uid}`}
                    href={creatorMonthVideosHref(
                      author.platform,
                      author.uid,
                      range.from,
                      range.to,
                    )}
                    prefetch={false}
                    className="group flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        className="truncate text-sm font-medium"
                        title={author.name || author.uid}
                      >
                        {author.name || author.uid}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {author.platform === "douyin"
                          ? "抖音"
                          : author.platform}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {author.works.toLocaleString("zh-CN")} 条
                    </span>
                    <span
                      className="w-20 shrink-0 text-right text-sm font-medium tabular-nums"
                      title={author.views.toLocaleString("zh-CN")}
                    >
                      {compact(author.views)}
                    </span>
                    <ArrowUpRight
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                ))
              ) : (
                <RankingEmpty />
              )}
            </div>
          </TabsContent>
          <TabsContent value="videos">
            <div className="flex items-center justify-between px-2 pb-2 text-xs text-muted-foreground">
              <span>排名 / 作品</span>
              <span>累计播放</span>
            </div>
            <div
              className="max-h-40 overflow-y-auto overscroll-contain"
              tabIndex={0}
              role="region"
              aria-label="作品播放量前十名"
            >
              {videos.length ? (
                videos.map((video, index) => (
                  <a
                    key={video.id}
                    href={
                      /^https?:\/\//i.test(video.url) ? video.url : undefined
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    aria-label={`${video.title || video.externalId}，新窗口打开原视频`}
                  >
                    <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-sm"
                      title={video.title}
                    >
                      {video.title || video.externalId}
                    </span>
                    <span
                      className="w-20 shrink-0 text-right text-sm font-medium tabular-nums"
                      title={video.views.toLocaleString("zh-CN")}
                    >
                      {compact(video.views)}
                    </span>
                    <ArrowUpRight
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </a>
                ))
              ) : (
                <RankingEmpty />
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
function RankingEmpty() {
  return (
    <Empty className="h-64 py-6">
      <EmptyHeader>
        <EmptyTitle>该时段暂无排行</EmptyTitle>
        <EmptyDescription>调整作品发布时间查看其他时段。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
