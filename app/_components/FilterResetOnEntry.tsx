"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { resetEntryFilters } from "@/lib/filter-entry";

export default function FilterResetOnEntry() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const lastPath = useRef(pathname);
  useEffect(() => {
    lastPath.current = pathname;
  }, [pathname]);

  useEffect(() => {
    // navigate 在浏览器改变地址之前发出，popstate 时 React 可能已恢复目标页。
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    let traversalFrom: string | undefined;
    function recordSource(event: Event) {
      if ("navigationType" in event && event.navigationType === "traverse") {
        traversalFrom = location.pathname;
      }
    }
    navigation?.addEventListener("navigate", recordSource);
    function onHistoryNavigation() {
      // 前进/后退会恢复历史页面；跨页时需要重新读取该页数据。
      const url = new URL(location.href);
      const from = traversalFrom ?? lastPath.current;
      traversalFrom = undefined;
      if (url.pathname === from) return;
      if (!/^\/(operator|dashboard)(\/|$)/.test(url.pathname)) return;
      // 等 Next 完成本次 popstate，再对恢复的目的地执行一次导航或刷新。
      setTimeout(() => {
        if (location.href !== url.href) return;
        if (resetEntryFilters(url)) {
          router.replace(url.pathname + url.search + url.hash, { scroll: false });
        } else {
          router.refresh();
        }
      }, 0);
    }
    window.addEventListener("popstate", onHistoryNavigation, true);
    return () => {
      navigation?.removeEventListener("navigate", recordSource);
      window.removeEventListener("popstate", onHistoryNavigation, true);
    };
  }, [router]);

  useEffect(() => {
    const url = new URL(location.href);
    // 标记不参与数据查询。只更新地址，保留当前页面和历史记录的位置。
    if (url.searchParams.has("keepFilters")) {
      url.searchParams.delete("keepFilters");
      const entry = location.href;
      queueMicrotask(() => {
        if (location.href === entry) {
          window.history.replaceState(null, "", url.pathname + url.search + url.hash);
        }
      });
    }
  }, [pathname, search]);

  return null;
}
