"use client";

import { useRef, type CSSProperties, type PointerEvent } from "react";
import { Library, Shield, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./InspirationHero.module.css";

export default function InspirationHero({ count }: { count: number }) {
  const spotlightPreference = useRef<MediaQueryList | null>(null);

  function moveSpotlight(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;
    spotlightPreference.current ??= window.matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
    if (!spotlightPreference.current.matches) return;

    const hero = event.currentTarget;
    const rect = hero.getBoundingClientRect();
    hero.style.setProperty("--terrain-x", `${event.clientX - rect.left}px`);
    hero.style.setProperty("--terrain-y", `${event.clientY - rect.top}px`);
    hero.dataset.spotlight = "active";
  }

  function clearSpotlight(event: PointerEvent<HTMLElement>) {
    delete event.currentTarget.dataset.spotlight;
  }

  return (
    <header
      className={cn(styles.hero, "relative isolate overflow-hidden rounded-(--radius-xl) border bg-card px-6 py-8 sm:px-10 sm:py-10")}
      onPointerMove={moveSpotlight}
      onPointerLeave={clearSpotlight}
      onPointerCancel={clearSpotlight}
    >
      <div className={styles.lighting} aria-hidden="true">
        <div className={styles.spotlight} />
      </div>
      <div className={styles.terrain} aria-hidden="true">
        <div className={styles.contours}>
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} style={{ "--contour-index": index } as CSSProperties} />
          ))}
        </div>
        <div className={styles.route}><span /><span /><span /></div>
      </div>

      <div className="relative z-10 max-w-3xl">
        <div className={cn(styles.eyebrow, "mb-4 flex items-center gap-2 text-sm font-medium text-primary")}>
          <Sparkles className="size-4" aria-hidden="true" />
          创作灵感 · 率土创作素材
        </div>
        <h1 className={cn(styles.title, "text-3xl font-semibold leading-tight tracking-tight sm:text-4xl")}>
          下一条好内容，<br className="sm:hidden" />从这里开始
        </h1>
        <p className={cn(styles.description, "mt-4 max-w-xl text-base leading-7 text-muted-foreground")}>
          从武将立绘到赛季故事，寻找适合你的创作素材。也可以跟着教程学方法，把灵感变成下一条作品。
        </p>
        <div className={cn(styles.meta, "mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground")}>
          <span className="flex items-center gap-2">
            <Library className="size-4" aria-hidden="true" />{count} 份公开资源
          </span>
          <span className="flex items-center gap-2">
            <Shield className="size-4" aria-hidden="true" />无需登录即可浏览
          </span>
        </div>
      </div>
    </header>
  );
}
