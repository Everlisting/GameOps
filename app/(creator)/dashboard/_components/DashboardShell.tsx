"use client";

import { usePathname } from "next/navigation";

/** 详情页路径正则:/dashboard/activities/<id>(无再深路径) */
const HIDE_ASIDE_PATTERNS = [/^\/dashboard\/activities\/[^/?#]+$/];

/**
 * Dashboard 壳:左主区 + 右固定侧栏(xl 以上显示)。
 * 命中 HIDE_ASIDE_PATTERNS(活动详情页)时只渲染主区。
 */
export default function DashboardShell({
  children,
  sidebar,
}: {
  children: React.ReactNode;
  sidebar: React.ReactNode;
}) {
  const pathname = usePathname();
  const hide = HIDE_ASIDE_PATTERNS.some((re) => re.test(pathname));

  if (hide) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1">{children}</div>
      <aside className="hidden space-y-4 p-6 xl:sticky xl:top-0 xl:block xl:w-[380px] xl:shrink-0 xl:pl-0 2xl:w-[420px]">
        {sidebar}
      </aside>
    </div>
  );
}
