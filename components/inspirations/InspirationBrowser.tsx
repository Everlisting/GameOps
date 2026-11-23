"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Award, BookOpen, Camera, ChevronLeft, ChevronRight, Clapperboard, Layers, Link2, ScanLine, ScrollText, Search, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MagicCard } from "@/components/ui/magic-card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { getCollection, INSPIRATION_COLLECTIONS, INSPIRATION_TOPICS, type InspirationCardData } from "@/lib/inspiration-catalog";
import { cn } from "@/lib/utils";
import InspirationHero from "./InspirationHero";
import ResourceCard from "./ResourceCard";
import ResourceDetail from "./ResourceDetail";

const topicIcons = [Users, Layers, ScanLine, Award, Clapperboard, Camera, BookOpen, ScrollText, Link2];

type Props = {
  items: InspirationCardData[]; activeItem: InspirationCardData | null; total: number; page: number; pages: number;
  counts: Record<string, number>; topicCounts: Record<string, number>; allTags: string[];
  filters: { collection: string; topic: string; q: string; tag: string; sort: string };
};

export default function InspirationBrowser({ items, activeItem, total, page, pages, counts, topicCounts, allTags, filters }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  const [active, setActive] = useState<InspirationCardData | null>(activeItem);
  useEffect(() => setQ(filters.q), [filters.q]);
  useEffect(() => setActive(activeItem), [activeItem]);

  function navigate(patch: Record<string, string>, resetPage = true) {
    const params = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(patch)) value ? params.set(key, value) : params.delete(key);
    if (resetPage) params.delete("page");
    params.delete("item");
    params.set("keepFilters", "1");
    startTransition(() => router.push(`${pathname}?${params}`, { scroll: false }));
  }
  function reset() { setQ(""); navigate({ collection: "", topic: "", q: "", tag: "", sort: "" }); }
  function closeDetail() {
    setActive(null);
    if (search.has("item")) {
      const params = new URLSearchParams(search.toString());
      params.delete("item");
      router.replace(`${pathname}?${params}`, { scroll: false });
    }
  }
  const collection = getCollection(filters.collection);
  const hasFilters = collection.key !== "all" || !!(filters.topic || filters.q || filters.tag);

  return <div className="flex min-w-0 flex-col gap-8">
    <InspirationHero count={counts.all ?? 0} />

    <section aria-labelledby="topics-title" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3"><h2 id="topics-title" className="text-lg font-semibold">按主题找素材</h2><Button variant="ghost" className="min-h-11" onClick={() => navigate({ topic: "" })} disabled={!filters.topic}>全部主题</Button></div>
      <nav aria-label="素材主题" className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-3 pt-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:p-0 xl:grid-cols-5 2xl:grid-cols-9">
        {INSPIRATION_TOPICS.map((topic, index) => {
          const Icon = topicIcons[index];
          const selected = filters.topic === topic.label;
          const count = topicCounts[topic.label] ?? 0;
          return (
            <MagicCard
              key={topic.label}
              className={cn(
                "inspiration-card grid min-w-40 rounded-(--radius-md) [--color-background:var(--color-bg-surface)] sm:min-w-0",
                selected && "[--color-background:var(--color-brand-primary-soft)] [--color-border:var(--color-brand-primary)]",
              )}
              gradientSize={120}
              gradientFrom="var(--color-brand-primary)"
              gradientTo="var(--color-brand-primary-soft)"
              gradientColor="color-mix(in oklab, var(--color-brand-primary) 7%, transparent)"
            >
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => navigate({ topic: selected ? "" : topic.label })}
                className={cn(
                  "flex size-full cursor-pointer flex-col gap-2.5 rounded-[inherit] p-3.5 text-left focus-visible:outline-none focus-visible:inset-ring-2 focus-visible:inset-ring-ring",
                  count === 0 && !selected && "text-(--color-text-tertiary)",
                  selected && "text-(--color-brand-primary)",
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-(--radius-sm)", count || selected ? "bg-(--color-brand-primary-soft) text-(--color-brand-primary)" : "bg-(--color-bg-subtle)")}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="text-xs tabular-nums text-(--color-text-tertiary)">{count || "筹备中"}</span>
                </span>
                <span className="text-sm font-medium">{topic.label}</span>
                <span className={cn("line-clamp-2 text-xs leading-5", !!count && "text-muted-foreground")} title={topic.description}>{topic.description}</span>
              </button>
            </MagicCard>
          );
        })}
      </nav>
    </section>

    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[190px_minmax(0,1fr)]">
      <aside aria-label="资源类型" className="min-w-0 lg:sticky lg:top-5">
        <h2 className="mb-3 text-sm font-semibold">资源类型</h2>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
          {INSPIRATION_COLLECTIONS.map((entry) => <Button key={entry.key} variant={collection.key === entry.key ? "secondary" : "ghost"} aria-pressed={collection.key === entry.key} className={cn("min-h-11 shrink-0 justify-between gap-5 px-3 lg:w-full", collection.key !== entry.key && "text-muted-foreground")} onClick={() => navigate({ collection: entry.key === "all" ? "" : entry.key })}><span>{entry.label}</span><span className="text-xs tabular-nums text-(--color-text-tertiary)">{counts[entry.key] ?? 0}</span></Button>)}
        </div>
        <p className="mt-5 hidden text-xs leading-6 text-muted-foreground lg:block">主题与类型可以组合筛选。<br />找到适合你的创作方式。</p>
      </aside>

      <div className="flex min-w-0 flex-col gap-5">
        <section aria-label="资源筛选" className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field className="min-w-0 flex-1"><FieldLabel htmlFor="library-search">搜索资源</FieldLabel><div className="flex gap-2"><Input id="library-search" className="h-11 rounded-(--radius-md) bg-card placeholder:text-(--color-text-tertiary)" placeholder="搜索标题或简介，如：开荒、战报模板" value={q} onChange={(event) => setQ(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); navigate({ q: q.trim() }); } }} /><Button className="min-h-11" onClick={() => navigate({ q: q.trim() })} disabled={pending}><Search data-icon="inline-start" />搜索</Button></div></Field>
            <Field className="sm:w-36"><FieldLabel htmlFor="library-sort">排序</FieldLabel><Select value={filters.sort} onValueChange={(value) => navigate({ sort: value })}><SelectTrigger id="library-sort" className="h-11 w-full bg-card"><SelectValue /></SelectTrigger><SelectContent className="inspiration-theme inspiration-panel"><SelectGroup><SelectItem value="newest">最新发布</SelectItem><SelectItem value="oldest">最早发布</SelectItem></SelectGroup></SelectContent></Select></Field>
          </div>
          {allTags.length > 0 && <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-sm text-muted-foreground">热门标签</span>{allTags.map((tag) => <Button key={tag} variant={filters.tag === tag ? "secondary" : "ghost"} className="min-h-11 px-3" aria-pressed={filters.tag === tag} onClick={() => navigate({ tag: filters.tag === tag ? "" : tag })}>#{tag}</Button>)}</div>}
        </section>
        <Separator />

    <section aria-label="资源列表" aria-busy={pending} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold">{filters.topic || collection.label}</h2><span className="text-xs text-muted-foreground" role="status">{pending ? "正在加载…" : `${total} 份资源`}</span>{filters.tag && <Badge variant="secondary">#{filters.tag}</Badge>}</div>
        {hasFilters && <Button variant="ghost" size="sm" onClick={reset}><X data-icon="inline-start" />清除筛选</Button>}
      </div>
      {items.length === 0 ? <Empty className="rounded-xl border border-dashed"><EmptyHeader><EmptyMedia><Search /></EmptyMedia><EmptyTitle>{hasFilters ? "暂时没有匹配的资源" : "新的灵感，正在准备中"}</EmptyTitle><EmptyDescription>{hasFilters ? "换一个关键词，或清除筛选看看其他资源。" : "运营发布的素材和教程会出现在这里，欢迎稍后再来。"}</EmptyDescription></EmptyHeader>{hasFilters && <Button variant="outline" onClick={reset}>查看全部资源</Button>}</Empty> :
        <ul className={cn("grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] lg:gap-5", pending && "opacity-60")}>
          {items.map((item) => <li key={item.id} className="min-w-0"><ResourceCard item={item} onOpen={() => setActive(item)} /></li>)}
        </ul>}
      {pages > 1 && <nav aria-label="资源分页" className="mt-2 flex items-center justify-center gap-4"><Button variant="outline" className="min-h-10" disabled={page <= 1 || pending} onClick={() => navigate({ page: String(page - 1) }, false)}><ChevronLeft data-icon="inline-start" />上一页</Button><span className="text-sm tabular-nums" aria-live="polite">{page} / {pages}</span><Button variant="outline" className="min-h-10" disabled={page >= pages || pending} onClick={() => navigate({ page: String(page + 1) }, false)}>下一页<ChevronRight data-icon="inline-end" /></Button></nav>}
    </section>
      </div>
    </div>

    <Dialog open={!!active} onOpenChange={(open) => { if (!open) closeDetail(); }}>
      <DialogContent className="inspiration-theme inspiration-panel flex max-h-[92dvh] w-[calc(100%-2rem)] max-w-[1100px] flex-col gap-0 overflow-hidden p-0 sm:p-0">{active && <ResourceDetail key={active.id} item={active} />}</DialogContent>
    </Dialog>
  </div>;
}
