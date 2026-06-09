"use client";

/**
 * BI 大屏 · 全屏壳。
 * 点右上角按钮调用浏览器 Fullscreen API 把 BI 内容区接管视口,
 * 退出后回到 SidebarInset 内的常规布局。
 */
import * as React from "react";
import { Maximize2, Minimize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FullscreenShell({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [isFull, setIsFull] = React.useState(false);

  React.useEffect(() => {
    const onChange = () => setIsFull(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = React.useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void ref.current?.requestFullscreen();
    }
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-1 flex-col gap-4 bg-background p-4",
        // 进入全屏时允许内容超出滚动,不被 SidebarInset 截断
        isFull && "overflow-y-auto",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">运营大屏 · 实时</div>
        <Button variant="outline" size="sm" onClick={toggle}>
          {isFull ? (
            <>
              <Minimize2 className="size-4" /> 退出全屏
            </>
          ) : (
            <>
              <Maximize2 className="size-4" /> 全屏
            </>
          )}
        </Button>
      </div>
      {children}
    </div>
  );
}
