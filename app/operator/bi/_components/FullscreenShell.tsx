"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3, Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import DateRangeField from "@/app/operator/_components/DateRangeField";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function FullscreenShell({
  children,
  range,
  loadedAt,
  historicalDefault,
}: {
  children: ReactNode;
  range: { from: string; to: string };
  loadedAt: string;
  historicalDefault: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [isFull, setIsFull] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  useEffect(() => {
    const onChange = () =>
      setIsFull(document.fullscreenElement === document.documentElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement === document.documentElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, []);

  async function toggle() {
    setFullscreenError("");
    try {
      // Fullscreen the document so Radix popovers portalled to body remain usable.
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setFullscreenError("当前浏览器无法进入全屏，请使用浏览器全屏功能。");
    }
  }
  function changeRange(from: string, to: string) {
    if (from === range.from && to === range.to) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("trendFrom", from);
    params.set("trendTo", to);
    startTransition(() =>
      router.push(`${pathname}?${params.toString()}`, { scroll: false }),
    );
  }
  const yesterday = new Date(
    new Date(loadedAt).getTime() + 8 * 3600000 - 86400000,
  )
    .toISOString()
    .slice(0, 10);
  return (
    <section
      aria-label="项目运营 BI 分析"
      data-bi-dashboard
      data-fullscreen={isFull}
      aria-busy={pending}
      className={cn(
        "flex min-w-0 flex-col gap-3 p-4 [--bi-views:color-mix(in_srgb,var(--chart-1)_80%,var(--foreground))] [--primary:var(--bi-views)] [--primary-foreground:var(--sidebar-primary-foreground)] [--bi-output:color-mix(in_srgb,var(--chart-2)_65%,var(--foreground))]",
        isFull &&
          "fixed inset-0 z-40 overflow-y-auto bg-background p-3 [&>div]:gap-2.5",
      )}
    >
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-3">
        <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <BarChart3 className="size-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold tracking-tight">
                项目运营 BI
              </h1>
              <p className="text-xs text-muted-foreground">
                内容传播表现与审核质量 · 北京时间
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Field
              orientation="horizontal"
              className="w-auto items-center gap-2"
            >
              <FieldLabel htmlFor="bi-date-range" className="sr-only">
                作品发布时间
              </FieldLabel>
              <DateRangeField
                id="bi-date-range"
                from={range.from}
                to={range.to}
                onChange={changeRange}
                clearable={false}
                width="w-56 min-h-11 sm:w-64"
                disabled={{
                  before: new Date("2000-01-01T00:00:00"),
                  after: new Date(`${yesterday}T00:00:00`),
                }}
              />
            </Field>
            <Button
              variant="outline"
              className="min-h-11 min-w-11"
              onClick={() => startTransition(() => router.refresh())}
              disabled={pending}
              aria-label="刷新大屏数据"
            >
              <RefreshCw
                data-icon="inline-start"
                className={cn(
                  pending && "animate-spin motion-reduce:animate-none",
                )}
              />
              <span className="hidden sm:inline">刷新</span>
            </Button>
            <Button
              variant="outline"
              className="min-h-11 min-w-11"
              onClick={() => void toggle()}
              aria-label={isFull ? "退出全屏" : "进入全屏"}
            >
              {isFull ? (
                <Minimize2 data-icon="inline-start" />
              ) : (
                <Maximize2 data-icon="inline-start" />
              )}
              <span className="hidden sm:inline">
                {isFull ? "退出全屏" : "全屏"}
              </span>
            </Button>
          </div>
        </header>
        {fullscreenError && (
          <p role="alert" className="text-sm text-destructive">
            {fullscreenError}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs leading-4 text-muted-foreground">
          <p>
            {historicalDefault && "默认查看最近有作品的30天。"}
            统计所选日期内发布的有效视频；播放量为这些作品的最新累计值。
          </p>
          <p className="tabular-nums" role="status">
            {pending
              ? "正在更新数据…"
              : `读取于 ${fmtDateTime(new Date(loadedAt))} · 手动刷新`}
          </p>
        </div>
        {children}
      </div>
    </section>
  );
}
