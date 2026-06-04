"use client";

/**
 * 创作者端 · 灵感浏览
 *
 * Tabs:全部 / 视频教程 / 文档教程 / 创作素材;选中 MATERIAL 多一级 category 子标签。
 * 标签云:点击切换 tag 筛选(再点同一个=取消);搜索框命中 title/summary。
 * 点卡片打开详情 Dialog,正文用等宽 + whitespace-pre-wrap 展示。
 *
 * 数据由父级一次性传 200 条,客户端做内存过滤,避免每次切 Tab 都请求。
 */
import { useMemo, useState } from "react";
import { ExternalLink, Lightbulb, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  INSPIRATION_TYPE_LABEL,
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABEL,
  type InspirationType,
  type MaterialCategory,
} from "@/lib/validation/inspiration";

export type InspirationCardData = {
  id: string;
  type: InspirationType;
  category: MaterialCategory | null;
  title: string;
  summary: string | null;
  content: string | null;
  url: string | null;
  coverImage: string | null;
  tags: string[];
  createdAt: string; // ISO
};

const TYPE_TABS: { value: "ALL" | InspirationType; label: string }[] = [
  { value: "ALL", label: "全部" },
  { value: "VIDEO_TUTORIAL", label: "视频教程" },
  { value: "DOC_TUTORIAL", label: "文档教程" },
  { value: "MATERIAL", label: "创作素材" },
];

export default function InspirationBrowser({
  items,
  allTags,
}: {
  items: InspirationCardData[];
  allTags: string[];
}) {
  const [tab, setTab] = useState<"ALL" | InspirationType>("ALL");
  const [cat, setCat] = useState<MaterialCategory | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (tab !== "ALL" && it.type !== tab) return false;
      if (tab === "MATERIAL" && cat !== "ALL" && it.category !== cat)
        return false;
      if (tag && !it.tags.includes(tag)) return false;
      if (q) {
        const needle = q.toLowerCase();
        const hay = `${it.title} ${it.summary ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, tab, cat, q, tag]);

  const activeItem = useMemo(
    () => (active ? items.find((i) => i.id === active) ?? null : null),
    [active, items],
  );

  return (
    <div className="space-y-5">
      {/* 类型 Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {TYPE_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              setTab(t.value);
              setCat("ALL");
            }}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* MATERIAL 子分类 */}
      {tab === "MATERIAL" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCat("ALL")}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
              cat === "ALL"
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            全部素材
          </button>
          {MATERIAL_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                cat === c
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {MATERIAL_CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      )}

      {/* 搜索 + 标签云 */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="按标题 / 简介搜索"
            className="pl-7"
          />
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">标签:</span>
            {allTags.slice(0, 24).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTag(tag === t ? null : t)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                  tag === t
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-dashed border-input text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
            {tag && (
              <button
                type="button"
                onClick={() => setTag(null)}
                className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-destructive"
              >
                <X className="size-3" />
                清除标签
              </button>
            )}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          共 {filtered.length} 条灵感
        </p>
      </Card>

      {/* 卡片网格 */}
      {filtered.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <Lightbulb className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            当前条件下没有灵感。试试切换 Tab 或清掉标签筛选。
          </p>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => setActive(i.id)}
                className="group block h-full w-full text-left"
              >
                <Card className="flex h-full flex-col overflow-hidden transition-colors hover:border-ring">
                  <div className="relative aspect-video w-full overflow-hidden bg-muted/40">
                    {i.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={i.coverImage}
                        alt=""
                        className="size-full object-cover transition-transform group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <Lightbulb className="size-8 opacity-40" />
                      </div>
                    )}
                    <div className="absolute left-2 top-2 flex items-center gap-1">
                      <Badge variant="secondary">
                        {INSPIRATION_TYPE_LABEL[i.type]}
                      </Badge>
                      {i.category && (
                        <Badge variant="outline">
                          {MATERIAL_CATEGORY_LABEL[i.category]}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <h3 className="line-clamp-2 text-sm font-medium group-hover:text-primary">
                      {i.title}
                    </h3>
                    <p className="line-clamp-3 text-xs text-muted-foreground">
                      {i.summary ?? i.content?.slice(0, 80) ?? "—"}
                    </p>
                    {i.tags.length > 0 && (
                      <div className="mt-auto flex flex-wrap gap-1">
                        {i.tags.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={!!activeItem}
        onOpenChange={(o) => {
          if (!o) setActive(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          {activeItem && <DetailBody item={activeItem} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailBody({ item }: { item: InspirationCardData }) {
  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{INSPIRATION_TYPE_LABEL[item.type]}</Badge>
          {item.category && (
            <Badge variant="outline">
              {MATERIAL_CATEGORY_LABEL[item.category]}
            </Badge>
          )}
        </div>
        <DialogTitle className="mt-1">{item.title}</DialogTitle>
        {item.summary && (
          <DialogDescription>{item.summary}</DialogDescription>
        )}
      </DialogHeader>

      {item.coverImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.coverImage}
          alt=""
          className="aspect-video w-full rounded-md object-cover"
        />
      )}

      {/* 视频:本地上传 → <video>;抖音/B 站等外链 → iframe 走 open player */}
      {((item.type === "VIDEO_TUTORIAL") ||
        (item.type === "MATERIAL" && item.category === "VIDEO")) &&
        item.url &&
        (isLocalVideo(item.url) ? (
          <video
            src={item.url}
            controls
            preload="metadata"
            className="max-h-[60vh] w-full rounded-md bg-black"
          />
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <iframe
              src={asEmbeddable(item.url)}
              title={item.title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="aspect-video w-full border-0"
            />
          </div>
        ))}

      {(item.type === "MATERIAL" && item.category === "IMAGE" && item.url) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.url}
          alt={item.title}
          className="max-h-[60vh] w-full rounded-md object-contain"
        />
      )}

      {item.content && (
        <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
          {item.content}
        </div>
      )}

      {item.url && item.type !== "VIDEO_TUTORIAL" && (
        <div>
          <Button asChild variant="outline" size="sm">
            <a href={item.url} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" />
              打开外链
            </a>
          </Button>
        </div>
      )}

      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.tags.map((t) => (
            <span
              key={t}
              className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * 把抖音视频页转换为可嵌入的 open player 链接;其他直接原 URL。
 * 仅做最小兼容,失败的视频会显示空白(此时用户可点「打开外链」)。
 */
function asEmbeddable(url: string): string {
  const m = /douyin\.com\/video\/(\d+)/.exec(url);
  if (m) {
    return `https://open.douyin.com/player/video?vid=${m[1]}&autoplay=0`;
  }
  return url;
}

/** 站内上传的视频路径 / 直链 .mp4|.webm|.mov,可以走原生 <video> 播放 */
function isLocalVideo(url: string): boolean {
  if (url.startsWith("/uploads/inspirations/video/")) return true;
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}
