"use client";

import { useState } from "react";
import { AudioLines, ImageIcon, Layers, Play } from "lucide-react";
import { MagicCard } from "@/components/ui/magic-card";
import { collectionForItem, safeResourceUrl, type InspirationCardData } from "@/lib/inspiration-catalog";
import { fmtDate } from "@/lib/format";
import { inspirationFiles } from "@/lib/inspiration-files";

import DocCover from "./DocCover";
import MediaCover from "./MediaCover";

export default function ResourceCard({ item, onOpen }: { item: InspirationCardData; onOpen: () => void }) {
  const [failedCovers, setFailedCovers] = useState<string[]>([]);
  const files = inspirationFiles(item);
  const cover = [safeResourceUrl(item.coverImage), ...files.filter(file => file.kind === "image").map(file => safeResourceUrl(file.url))]
    .find((url): url is string => !!url && !failedCovers.includes(url));
  const document = item.type === "DOC_TUTORIAL" || item.category === "TEMPLATE" || item.category?.startsWith("TEXT");
  const Icon = item.category === "AUDIO" ? AudioLines : item.category === "IMAGE" ? ImageIcon
    : item.type === "VIDEO_TUTORIAL" || item.category === "VIDEO" ? Play : Layers;
  const date = fmtDate(item.createdAt);
  return (
    <MagicCard
      className="inspiration-card grid h-full min-w-0 rounded-(--radius-lg) [--color-background:var(--color-bg-surface)]"
      gradientSize={160}
      gradientFrom="var(--color-brand-primary)"
      gradientTo="var(--color-brand-primary-soft)"
      gradientColor="color-mix(in oklab, var(--color-brand-primary) 6%, transparent)"
    >
      <button type="button" onClick={onOpen} className="flex size-full min-w-0 cursor-pointer flex-col rounded-[inherit] p-3 text-left focus-visible:outline-none">
        <span className="inspiration-cover relative block aspect-[4/3] w-full overflow-hidden rounded-(--radius-md)">
          {cover ? (
            <MediaCover key={cover} src={cover} item={item} onError={() => setFailedCovers(previous => [...previous, cover])} />
          ) : document ? <DocCover item={item} /> : (
            <span className="inspiration-media-placeholder" aria-hidden="true"><Icon className="size-7" /></span>
          )}
          {files.length > 1 && (
            <span className="absolute right-2 top-2 rounded-(--radius-pill) bg-(--color-file-badge) px-2 py-1 text-xs text-(--color-text-inverse) backdrop-blur-[8px]">
              {files.length} 个文件
            </span>
          )}
        </span>
        <span title={item.title} className="mt-3 block w-full truncate text-sm font-semibold leading-5 text-foreground">{item.title}</span>
        <span className="mt-2 flex w-full items-center justify-between gap-2 text-xs">
          <span className="min-w-0 truncate rounded-(--radius-xs) bg-(--color-brand-primary-soft) px-1.5 py-0.5 text-(--color-brand-primary)">{collectionForItem(item).label}</span>
          <time dateTime={item.createdAt} title={date} className="shrink-0 tabular-nums text-(--color-text-tertiary)">{date.slice(5)}</time>
        </span>
      </button>
    </MagicCard>
  );
}
