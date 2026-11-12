"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function AuthorSearch({ matched, total }: { matched: number; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search.get("authorQ") ?? "";
  const [value, setValue] = useState(query);
  useEffect(() => setValue(query), [query]);

  function commit(next: string, force = false) {
    const trimmed = next.trim();
    if (!force && trimmed === query) return;
    const params = new URLSearchParams(search.toString());
    if (trimmed) params.set("authorQ", trimmed);
    else params.delete("authorQ");
    params.set("authors", "1");
    params.set("tab", "settlement");
    router.push(`${pathname}?${params}#activity-detail-tabs`, { scroll: false });
  }

  return <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="flex flex-wrap items-end gap-2">
      <Field className="w-64 max-w-full">
        <FieldLabel htmlFor="settlement-author-search">搜索达人</FieldLabel>
        <Input id="settlement-author-search" placeholder="UID / 抖音号 / 抖音昵称" value={value} maxLength={160}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => commit(value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); commit(value); }
          }} />
      </Field>
      <Button variant="outline" disabled={!query && !value} onClick={() => { setValue(""); commit("", true); }}>清除</Button>
    </div>
    <p className="text-xs text-muted-foreground" role="status">{query ? `匹配 ${matched.toLocaleString()} / ${total.toLocaleString()} 位达人` : `共 ${total.toLocaleString()} 位达人`}</p>
  </div>;
}
