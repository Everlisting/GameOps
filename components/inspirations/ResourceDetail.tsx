"use client";

import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, FileText, Maximize, Minimize, Share2, ZoomIn } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { collectionForItem, safeResourceUrl, type InspirationCardData } from "@/lib/inspiration-catalog";
import { getInspirationDocument } from "@/lib/inspiration-document";
import { cn } from "@/lib/utils";
import { formatFileSize, inspirationFiles, isStoryInspiration, localInspirationUpload, storyArchiveMedia, type InspirationFileData } from "@/lib/inspiration-files";

function getPreviewUrl(item: InspirationCardData, file?: InspirationFileData) {
  const url = safeResourceUrl(file?.url ?? item.url);
  const video = file ? file.kind === "video" : item.type === "VIDEO_TUTORIAL" || item.category === "VIDEO";
  if (file?.kind === "image" && url) return { kind: "image" as const, url };
  if (video && url) {
    if (/^\/uploads\/inspirations\/video\//.test(url) || /\.(mp4|webm|mov)(\?|$)/i.test(url)) {
      return { kind: "video" as const, url };
    }
    const douyin = /^https:\/\/(?:www\.)?douyin\.com\/video\/(\d+)/.exec(url);
    if (douyin) return { kind: "embed" as const, url: `https://open.douyin.com/player/video?vid=${douyin[1]}&autoplay=0` };
  }
  if (file?.kind === "audio" && url && (/^\/uploads\/inspirations\/audio\//.test(url) || /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(url))) {
    return { kind: "audio" as const, url };
  }
  if (url && (file?.kind === "doc" || (!file && item.type === "DOC_TUTORIAL"))) {
    const document = getInspirationDocument(url);
    if (document) return document;
  }
  const cover = !file && isStoryInspiration(item) ? safeResourceUrl(item.coverImage) : null;
  return cover ? { kind: "image" as const, url: cover } : null;
}

function decodePreviewImage(event: SyntheticEvent<HTMLImageElement>, onReady?: () => void, onError?: () => void) {
  if (!onReady) return;
  // 显示已经解码的图片节点，避免切换时出现空白。
  const image = event.currentTarget;
  void image.decode().then(
    () => { if (image.isConnected) onReady(); },
    () => { if (image.isConnected) onError?.(); },
  );
}

export default function ResourceDetail({ item }: { item: InspirationCardData }) {
  const [copied, setCopied] = useState<"content" | "link" | "error" | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const zoomTrigger = useRef<HTMLButtonElement>(null);
  const files = inspirationFiles(item);
  const [selection, setSelection] = useState(() => {
    const first = files[0];
    const pdf = getPreviewUrl(item, first)?.kind === "feishu-doc"
      ? files.find((file) => getPreviewUrl(item, file)?.kind === "pdf")
      : undefined;
    return { visibleId: (pdf ?? first)?.id ?? "", pendingId: "", failed: false };
  });
  const selectedIndex = Math.max(0, files.findIndex((file) => file.id === selection.visibleId));
  const selected = files[selectedIndex];
  const pending = files.find((file) => file.id === selection.pendingId);
  const cursorIndex = pending ? files.indexOf(pending) : selectedIndex;
  const multiple = files.length > 1;
  const url = safeResourceUrl(selected?.url ?? item.url);
  const story = isStoryInspiration(item);
  const setting = item.tags.includes("武将设定");
  const storyText = !!item.content?.trim();
  const storyMedia = story ? storyArchiveMedia(item, files) : [];
  const downloadAll = story
    ? (multiple && (storyText || storyMedia.length > 0)) || (storyMedia.length > 0 && (storyText || !files.length))
    : multiple;
  const showPreview = !!selected || !!getPreviewUrl(item);
  const downloadable = !!((url && localInspirationUpload(url)) || (!url && item.content));
  const downloadUrl = `/api/inspirations/${item.id}/download`;
  const previous = files[cursorIndex - 1];
  const next = files[cursorIndex + 1];
  const images = zoomed ? files.filter((file) => getPreviewUrl(item, file)?.kind === "image") : [];
  const imageIndex = images.findIndex((file) => file.id === selected?.id);
  const imageCursor = pending ? images.indexOf(pending) : imageIndex;
  const previousImage = images[imageCursor - 1];
  const nextImage = images[imageCursor + 1];

  useEffect(() => {
    const id = selection.pendingId;
    if (!id) return;
    const timeout = window.setTimeout(() => {
      setSelection((current) => current.pendingId === id ? { ...current, pendingId: "", failed: true } : current);
    }, 20_000);
    return () => window.clearTimeout(timeout);
  }, [selection.pendingId]);

  function selectFile(file: InspirationFileData) {
    setSelection((current) => {
      const preview = getPreviewUrl(item, file);
      if (file.id === current.visibleId || !preview) {
        return { visibleId: file.id, pendingId: "", failed: false };
      }
      return { ...current, pendingId: file.id, failed: false };
    });
  }

  function finishPreview(id: string, ready: boolean) {
    // 快速切换时，已经取消的预览可能比当前请求更晚完成。
    setSelection((current) => {
      if (current.pendingId !== id) return current;
      return { visibleId: ready ? id : current.visibleId, pendingId: "", failed: !ready };
    });
  }

  function changeZoom(open: boolean) {
    setZoomed(open);
    setSelection((current) => current.pendingId || current.failed
      ? { ...current, pendingId: "", failed: false }
      : current);
  }

  async function copy(kind: "content" | "link") {
    try {
      const link = new URL("/inspirations", window.location.origin);
      link.searchParams.set("item", item.id);
      await navigator.clipboard.writeText(kind === "content" ? item.content ?? "" : link.href);
      setCopied(kind);
    } catch { setCopied("error"); }
  }

  return <>
    <div className="shrink-0 border-b px-5 pb-4 pt-5 sm:px-6">
      <DialogHeader className="gap-1.5 pr-8">
        <DialogDescription>{collectionForItem(item).label}</DialogDescription>
        <DialogTitle className="break-words text-xl leading-7">{item.title}</DialogTitle>
      </DialogHeader>
      <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="资源操作">
        {(downloadAll || downloadable) && (
          <Button asChild size="sm" className="min-h-10 px-3">
            <a href={downloadAll ? `${downloadUrl}?all=1` : downloadUrl} download>
              <Download data-icon="inline-start" />
              {downloadAll ? "下载全部" : "下载素材"}
            </a>
          </Button>
        )}
        {item.content && <Button variant="ghost" size="icon" className="size-10" title="复制正文" aria-label="复制正文" onClick={() => copy("content")}>{copied === "content" ? <Check /> : <Copy />}</Button>}
        <Button variant="ghost" size="icon" className="size-10" title="分享资源" aria-label="分享资源" onClick={() => copy("link")}>{copied === "link" ? <Check /> : <Share2 />}</Button>
        <span role="status" className="text-xs text-muted-foreground">{copied === "error" ? "复制失败，请手动选择正文复制。" : copied ? "已复制" : ""}</span>
      </div>
    </div>

    <div className="no-scrollbar min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6">
      {item.summary && <p className="mb-4 text-sm leading-6 text-muted-foreground">{item.summary}</p>}
      <div className={cn("grid min-w-0 gap-5", story && item.content && showPreview && "md:grid-cols-2")}>
        {item.content && <section className={cn("min-w-0", story ? "order-first" : "order-last")} aria-label={story ? "故事正文" : "资源说明"}>
          <h3 className="mb-2 text-sm font-medium">{story ? "故事正文" : "资源说明"}</h3>
          <div tabIndex={0} className="no-scrollbar max-h-[40dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-4 text-sm leading-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{item.content}</div>
        </section>}
        {showPreview && <section aria-label="素材预览" className="min-w-0">
          {selected && multiple && (
            <div aria-live="polite" className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="truncate" title={selected.name}>{selected.name}</span>
              <span className="shrink-0 tabular-nums">{selectedIndex + 1} / {files.length}</span>
            </div>
          )}
          <div className={cn("min-w-0", multiple && "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 sm:gap-3")}>
            {multiple && (
              <Button type="button" variant="outline" size="icon" className="size-11 rounded-full" aria-label="上一个文件" disabled={!previous} onClick={() => previous && selectFile(previous)}>
                <ChevronLeft />
              </Button>
            )}
            <div className={cn("relative min-w-0", multiple && "h-[clamp(12rem,48dvh,32rem)] overflow-hidden rounded-lg bg-muted/30")}>
              {(pending ? [selected, pending] : [selected]).map((file) => {
                const loading = !!file && file.id === pending?.id;
                return (
                  <div
                    key={file?.id ?? item.id}
                    data-preview-layer={loading ? "pending" : "visible"}
                    aria-hidden={loading || undefined}
                    className={cn(
                      multiple && "flex h-full min-w-0 flex-col justify-center",
                      loading && "pointer-events-none invisible absolute inset-0",
                    )}
                  >
                    <PreviewMedia
                      item={item}
                      file={file}
                      inFrame={multiple}
                      onZoom={loading ? undefined : () => changeZoom(true)}
                      zoomTrigger={loading ? undefined : zoomTrigger}
                      onReady={loading && !zoomed ? () => finishPreview(file.id, true) : undefined}
                      onError={loading && !zoomed ? () => finishPreview(file.id, false) : undefined}
                    />
                  </div>
                );
              })}
              <span role="status" className={cn(
                "pointer-events-none absolute bottom-2 left-1/2 max-w-[calc(100%-1rem)] -translate-x-1/2 rounded-md border bg-card px-2 py-1 text-center text-xs text-muted-foreground",
                !pending && !selection.failed && "sr-only",
              )}>
                {pending ? "正在加载预览…" : selection.failed ? "预览加载失败，请重试。" : ""}
              </span>
            </div>
            {multiple && (
              <Button type="button" variant="outline" size="icon" className="size-11 rounded-full" aria-label="下一个文件" disabled={!next} onClick={() => next && selectFile(next)}>
                <ChevronRight />
              </Button>
            )}
          </div>
        </section>}
      </div>
      {multiple && <ResourceFileList files={files} selectedId={selected?.id} onSelect={selectFile} downloadUrl={downloadUrl} />}
      {item.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{item.tags.map((tag) => <Badge key={tag} variant="outline" className="font-normal">{tag}</Badge>)}</div>}
    </div>

    <Dialog open={zoomed} onOpenChange={changeZoom}>
      <DialogContent
        className="inspiration-theme inspiration-panel w-[calc(100%-1rem)] max-w-[1440px] grid-cols-[minmax(0,1fr)] gap-2 p-2 sm:w-[calc(100%-2rem)] sm:gap-3 sm:p-4"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          zoomTrigger.current?.focus({ preventScroll: true });
        }}
        onKeyDown={(event) => {
          if (event.defaultPrevented) return;
          const target = event.key === "ArrowLeft" ? previousImage : event.key === "ArrowRight" ? nextImage : undefined;
          if (!target) return;
          event.preventDefault();
          selectFile(target);
        }}
      >
        <DialogTitle className="sr-only">{item.title}的放大图片</DialogTitle>
        <DialogDescription className="sr-only">图片预览</DialogDescription>
        <div aria-live="polite" className="flex h-8 min-w-0 items-center gap-3 pl-2 pr-12 text-sm text-muted-foreground">
          <span className="truncate" title={selected?.name ?? item.title}>{selected?.name ?? item.title}</span>
          {images.length > 1 && <span className="shrink-0 tabular-nums">{imageIndex + 1} / {images.length}</span>}
        </div>
        <div className={cn("min-w-0", images.length > 1 && "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 sm:gap-3")}>
          {images.length > 1 && (
            <Button type="button" variant="outline" size="icon" className="size-9 rounded-full aria-disabled:pointer-events-none aria-disabled:opacity-50 sm:size-11" aria-label="上一张图片" aria-disabled={!previousImage} onClick={() => previousImage && selectFile(previousImage)}>
              <ChevronLeft />
            </Button>
          )}
          <div className="relative h-[min(76dvh,56rem)] min-w-0 overflow-hidden rounded-lg bg-muted/30">
            {(pending ? [selected, pending] : [selected]).map((file) => {
              const preview = getPreviewUrl(item, file);
              if (preview?.kind !== "image") return null;
              const loading = !!file && file.id === pending?.id;
              const title = file?.name ?? item.title;
              const onError = loading ? () => finishPreview(file.id, false) : undefined;
              const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
                if (loading) decodePreviewImage(event, () => finishPreview(file.id, true), onError);
              };
              return (
                <div key={file?.id ?? item.id} aria-hidden={loading || undefined} className={cn("h-full min-w-0", loading && "pointer-events-none invisible absolute inset-0")}>
                  {setting ? (
                    <SettingImage src={preview.url} title={title} inFrame expanded onLoad={onLoad} onError={onError} />
                  ) : (
                    <img src={preview.url} alt={title} onLoad={onLoad} onError={onError} className="size-full object-contain" />
                  )}
                </div>
              );
            })}
            <span role="status" className={cn(
              "pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border bg-card px-2 py-1 text-xs text-muted-foreground",
              !pending && !selection.failed && "sr-only",
            )}>
              {pending ? "正在加载图片…" : selection.failed ? "图片加载失败，请重试。" : ""}
            </span>
          </div>
          {images.length > 1 && (
            <Button type="button" variant="outline" size="icon" className="size-9 rounded-full aria-disabled:pointer-events-none aria-disabled:opacity-50 sm:size-11" aria-label="下一张图片" aria-disabled={!nextImage} onClick={() => nextImage && selectFile(nextImage)}>
              <ChevronRight />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

function ResourceFileList({ files, selectedId, onSelect, downloadUrl }: {
  files: InspirationFileData[];
  selectedId?: string;
  onSelect: (file: InspirationFileData) => void;
  downloadUrl: string;
}) {
  return (
    <Collapsible className="mt-5 rounded-lg border">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className="group h-11 w-full justify-between px-3">
          <span className="flex items-center gap-2">
            <FileText data-icon="inline-start" />
            素材文件 <span className="text-xs text-muted-foreground">{files.length} 个</span>
          </span>
          <ChevronDown className="transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t">
        <ul aria-label="素材文件">
          {files.map((file, index) => {
            const local = localInspirationUpload(file.url);
            const selected = selectedId === file.id;
            return (
              <li key={file.id} className={cn("flex min-w-0 items-center gap-2 border-b px-3 last:border-b-0", selected && "bg-muted/60")}>
                <button type="button" aria-pressed={selected} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onSelect(file)}>
                  <span className="min-w-0 flex-1 truncate text-sm" title={file.name}>{file.name}{index === 0 ? " · 主文件" : ""}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                </button>
                {local && (
                  <Button asChild size="icon" variant="ghost" className="size-11">
                    <a href={`${downloadUrl}?file=${encodeURIComponent(file.id)}`} download aria-label={`下载文件 ${file.name}`}>
                      <Download />
                    </a>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PreviewMedia({ item, file, inFrame, onReady, onError, onZoom, zoomTrigger }: {
  item: InspirationCardData;
  file?: InspirationFileData;
  inFrame: boolean;
  onReady?: () => void;
  onError?: () => void;
  onZoom?: () => void;
  zoomTrigger?: React.Ref<HTMLButtonElement>;
}) {
  const preview = getPreviewUrl(item, file);
  const title = file?.name ?? item.title;
  if (preview?.kind === "image") {
    const onLoad = (event: SyntheticEvent<HTMLImageElement>) => decodePreviewImage(event, onReady, onError);
    const setting = item.tags.includes("武将设定");
    return (
      <div className={cn("relative min-w-0", inFrame && "h-full")}>
        {setting ? (
          <SettingImage src={preview.url} title={title} inFrame={inFrame} onLoad={onLoad} onError={onError} onZoom={onZoom} />
        ) : (
          <img
            src={preview.url}
            alt={title}
            onLoad={onLoad}
            onError={onError}
            onDoubleClick={onZoom}
            className={cn("w-full cursor-zoom-in rounded-lg object-contain", inFrame ? "h-full" : "max-h-[48dvh] bg-muted/30")}
          />
        )}
        {onZoom && (
          <Button ref={zoomTrigger} type="button" variant="secondary" size="icon" className="absolute right-2 top-2 size-11 shadow-sm" aria-label="放大图片" aria-haspopup="dialog" title="放大图片" onClick={onZoom}>
            <ZoomIn />
          </Button>
        )}
      </div>
    );
  }
  if (preview?.kind === "video") {
    return (
      <FullscreenPlayer inFrame={inFrame}>
        <video src={preview.url} controls playsInline preload="metadata" onLoadedMetadata={onReady} onError={onError} className={cn(
          "w-full rounded-lg bg-black object-contain",
          inFrame ? "h-full" : "max-h-[48dvh]",
        )} />
      </FullscreenPlayer>
    );
  }
  if (preview?.kind === "audio") {
    return <audio src={preview.url} controls preload="metadata" onLoadedMetadata={onReady} onError={onError} className="w-full" />;
  }
  if (preview?.kind === "embed") {
    return (
      <FullscreenPlayer inFrame={inFrame}>
        <iframe title={title} src={preview.url} onLoad={onReady} onError={onError} className={cn(
          "w-full rounded-lg border",
          inFrame ? "h-full" : "aspect-video",
        )} allow="fullscreen; encrypted-media; picture-in-picture" allowFullScreen />
      </FullscreenPlayer>
    );
  }
  if (preview?.kind === "pdf") {
    return (
      <iframe
        title={`${title} · PDF 预览`}
        src={preview.url}
        onLoad={onReady}
        onError={onError}
        className={cn("w-full rounded-lg border bg-card", inFrame ? "h-full" : "h-[65dvh]")}
      />
    );
  }
  if (preview?.kind === "tencent-doc" || preview?.kind === "feishu-doc") {
    const platform = preview.kind === "tencent-doc" ? "腾讯文档" : "飞书";
    const previewLabel = preview.kind === "tencent-doc" ? "腾讯文档预览" : "飞书文档预览";
    return (
      <div className={cn("flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card", inFrame && "h-full")}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 border-b px-3 py-1">
          <span className="text-sm font-medium">{previewLabel}</span>
          <Button asChild size="sm" variant="ghost">
            <a href={preview.url} target="_blank" rel="noopener noreferrer">
              {`在${platform}中查看`} <ExternalLink data-icon="inline-end" />
            </a>
          </Button>
        </div>
        <iframe
          title={`${item.title} · ${previewLabel}`}
          src={preview.url}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          onLoad={onReady}
          onError={onError}
          className={cn("w-full bg-white", inFrame ? "min-h-0 flex-1" : "h-[65dvh]")}
        />
      </div>
    );
  }
  if (!file) return null;
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
      <FileText className="size-8" />
      <p className="break-all">{title}</p>
      <p>{localInspirationUpload(file.url) ? "下载原文件后查看。" : "此文件暂不支持预览。"}</p>
    </div>
  );
}

function FullscreenPlayer({ children, inFrame }: { children: ReactNode; inFrame: boolean }) {
  const player = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);

  useEffect(() => {
    function syncFullscreen() {
      setFullscreen(document.fullscreenElement === player.current);
    }
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  async function toggleFullscreen() {
    const target = player.current;
    if (!target) return;
    setFullscreenError(false);
    try {
      if (document.fullscreenElement === target) {
        await document.exitFullscreen();
      } else if (document.fullscreenEnabled) {
        await target.requestFullscreen();
      } else {
        const video = target.querySelector<HTMLVideoElement & { webkitEnterFullscreen?: () => void }>("video");
        if (!video?.webkitEnterFullscreen) {
          setFullscreenError(true);
          return;
        }
        video.webkitEnterFullscreen();
      }
    } catch {
      setFullscreenError(true);
    }
  }

  return (
    <div ref={player} className={cn(
      "relative min-w-0 [&:fullscreen]:bg-black [&:fullscreen>video]:h-full [&:fullscreen>video]:max-h-none [&:fullscreen>iframe]:h-full",
      inFrame && "h-full",
    )}>
      {children}
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="absolute right-2 top-2 size-11 shadow-sm"
        aria-label={fullscreen ? "退出全屏" : "视频全屏"}
        title={fullscreen ? "退出全屏" : "视频全屏"}
        onClick={() => void toggleFullscreen()}
      >
        {fullscreen ? <Minimize /> : <Maximize />}
      </Button>
      {fullscreenError && <p role="status" className="absolute right-2 top-14 rounded-md bg-card px-2 py-1 text-xs">当前浏览器无法进入全屏。</p>}
    </div>
  );
}

function SettingImage({ src, title, inFrame, expanded, onLoad, onError, onZoom }: {
  src: string;
  title: string;
  inFrame: boolean;
  expanded?: boolean;
  onLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
  onError?: () => void;
  onZoom?: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; scroll: number } | null>(null);
  const [edges, setEdges] = useState({ left: true, right: true });
  function updateEdges() {
    const element = viewport.current;
    if (element) setEdges({ left: element.scrollLeft <= 1, right: element.scrollLeft + element.clientWidth >= element.scrollWidth - 1 });
  }
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  function move(direction: -1 | 1) {
    const element = viewport.current;
    if (element) element.scrollBy({ left: direction * element.clientWidth * 0.75, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  function release(event: React.PointerEvent<HTMLDivElement>) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <div className={cn("flex min-w-0 flex-col gap-2", inFrame && "h-full")}>
    <div className={cn("relative overflow-hidden rounded-lg bg-muted/30", inFrame && "min-h-0 flex-1")}>
      <div ref={viewport} role="region" aria-label="武将设定横幅，可左右滑动查看" tabIndex={0} onScroll={updateEdges} onDoubleClick={onZoom} className={cn("w-full min-w-0 cursor-grab overflow-x-auto overflow-y-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:cursor-grabbing", expanded ? "touch-pan-y touch-pinch-zoom [scrollbar-width:thin]" : "no-scrollbar", inFrame && "h-full")}
        onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); } }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0 || (event.pointerType === "touch" && !expanded)) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointer: event.pointerId, x: event.clientX, scroll: event.currentTarget.scrollLeft };
        }}
        onPointerMove={(event) => { const start = drag.current; if (start && start.pointer === event.pointerId) event.currentTarget.scrollLeft = start.scroll - (event.clientX - start.x); }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={() => { drag.current = null; }}>
        <div className={cn(expanded && "flex h-full w-max min-w-full justify-center", inFrame && !expanded && "h-full")}>
          <img src={src} alt={title} onLoad={(event) => { updateEdges(); onLoad(event); }} onError={onError} draggable={false} className={cn("block w-auto max-w-none shrink-0 select-none object-contain", inFrame ? "h-full" : "h-[44dvh]")} />
        </div>
      </div>
      {!inFrame && <>
        <Button variant="secondary" size="icon" className="absolute left-2 top-1/2 size-11 -translate-y-1/2 rounded-full border shadow-sm" disabled={edges.left} onClick={() => move(-1)} aria-label="向左查看武将设定" title="向左查看"><ChevronLeft /></Button>
        <Button variant="secondary" size="icon" className="absolute right-2 top-1/2 size-11 -translate-y-1/2 rounded-full border shadow-sm" disabled={edges.right} onClick={() => move(1)} aria-label="向右查看武将设定" title="向右查看"><ChevronRight /></Button>
      </>}
    </div>
    <p className="shrink-0 text-center text-xs text-muted-foreground">{expanded ? "拖动或左右滑动查看完整设定" : "滑动查看完整设定"}</p>
  </div>;
}
