"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function VideoSearch({ matched, total }: { matched: number; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search.get("videoQ") ?? "";
  const [value, setValue] = useState(query);
  const [pending, startTransition] = useTransition();
  useEffect(() => setValue(query), [query]);

  function commit(next: string) {
    const params = new URLSearchParams(search.toString());
    const trimmed = next.trim();
    if (trimmed) params.set("videoQ", trimmed);
    else params.delete("videoQ");
    params.set("videos", "1");
    params.set("tab", "videos");
    startTransition(() => router.push(`${pathname}?${params}#activity-detail-tabs`, { scroll: false }));
  }

  return <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="flex flex-wrap items-end gap-2">
      <Field className="w-80 max-w-full">
        <FieldLabel htmlFor="activity-video-search">搜索稿件</FieldLabel>
        <Input id="activity-video-search" placeholder="作品 ID / 达人 UID / 达人抖音号" value={value} maxLength={160}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); commit(value); }
          }} />
      </Field>
      <Button variant="outline" disabled={pending} onClick={() => commit(value)}>{pending ? "搜索中…" : "搜索"}</Button>
      <Button variant="outline" disabled={pending || (!query && !value)} onClick={() => { setValue(""); commit(""); }}>清除</Button>
    </div>
    <p className="text-xs text-muted-foreground" role="status">{query ? `匹配 ${matched.toLocaleString()} / ${total.toLocaleString()} 条稿件` : `共 ${total.toLocaleString()} 条稿件`}</p>
  </div>;
}
