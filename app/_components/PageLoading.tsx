import { Skeleton } from "@/components/ui/skeleton";

/** 路由级占位，保持在共享布局内，不依赖页面数据或客户端脚本。 */
export default function PageLoading() {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="页面加载中"
      className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-8 motion-reduce:[&_[data-slot=skeleton]]:animate-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div aria-hidden="true" className="flex min-w-0 flex-col gap-3">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-52 max-w-full sm:w-72" />
        </div>
        <p className="text-sm text-muted-foreground">正在加载页面…</p>
      </div>

      <div aria-hidden="true" className="flex min-w-0 flex-col gap-5 rounded-xl border bg-card p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-9 w-full sm:w-64" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="flex flex-col gap-6 py-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_5rem] items-center gap-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_5rem]"
            >
              <div className="flex min-w-0 flex-col gap-2">
                <Skeleton className="h-4 w-3/4 max-w-80" />
                <Skeleton className="h-3 w-1/2 max-w-48" />
              </div>
              <Skeleton className="hidden h-4 w-3/4 sm:block" />
              <Skeleton className="hidden h-4 w-2/3 sm:block" />
              <Skeleton className="h-6 w-16 justify-self-end" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
