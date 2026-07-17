"use client";

/**
 * 全局:进入新页面 / 刷新页面时,清空列表筛选参数并拉取最新数据。
 *
 * - 只在 pathname 变化(含首次挂载 = 刷新)时触发;用户在当前页操作筛选(仅 query 变、
 *   pathname 不变)不会被清,否则筛选一设就被抹掉。
 * - 只清「筛选白名单」内的参数;详情页动态路由段、登录回调 code/state、错误提示 error
 *   等非筛选参数一律不动,避免误伤功能。
 * - 软导航进入新页面时额外 router.refresh(),破除 Next.js Router Cache 的陈旧数据;
 *   首次挂载(刷新)本身已是服务端最新,无需再刷。
 */
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

// 全站列表筛选参数白名单(汇总自各页 searchParams 与筛选组件的 commit key)
const FILTER_KEYS = [
  "q",
  "groupNo",
  "status",
  "type",
  "category",
  "tag",
  "published",
  "role",
  "platform",
  "action",
  "targetType",
  "from",
  "to",
  "dateFrom",
  "dateTo",
  "publishedFrom",
  "publishedTo",
  "trendFrom",
  "trendTo",
  "sortBy",
  "order",
  "page",
  "pageSize",
  "active",
  "enabled",
  "enrolled",
  "activityId",
  "agentId",
  "csvType",
];

export default function FilterResetOnEntry() {
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useRef(false);

  useEffect(() => {
    const isFirst = !mounted.current;
    mounted.current = true;

    const url = new URL(window.location.href);

    // 带 keepFilters 标记的主动跳转(如榜单点主播跳视频页搜索):保留筛选,只去掉标记本身
    if (url.searchParams.has("keepFilters")) {
      url.searchParams.delete("keepFilters");
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
      return;
    }

    // 清掉当前 URL 上的筛选参数(若有)
    let changed = false;
    for (const key of FILTER_KEYS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) {
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    }

    // 软导航进入新页面 → 破除 Router Cache 拉最新;首次挂载(刷新)已是最新
    if (!isFirst) router.refresh();
  }, [pathname, router]);

  return null;
}
