"use client";

import * as React from "react";

/**
 * 折叠/展开类布尔状态 + localStorage 持久化。
 *
 * - SSR / 首屏先用 defaultOpen,避免水合不一致。
 * - 挂载后读 localStorage:有值则覆盖,无值保留 defaultOpen。
 * - 之后每次 set 都写回 localStorage(key 为 null 时跳过,如新建活动还没 id)。
 */
export function usePersistentToggle(
  key: string | null,
  defaultOpen: boolean,
): [boolean, (next: boolean) => void] {
  const [open, setOpen] = React.useState<boolean>(defaultOpen);

  React.useEffect(() => {
    if (!key) return;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) setOpen(stored === "1");
    } catch {
      // localStorage 不可用(隐私模式等):静默退化为内存态。
    }
  }, [key]);

  const set = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!key) return;
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // 同上,失败不阻塞。
      }
    },
    [key],
  );

  return [open, set];
}
