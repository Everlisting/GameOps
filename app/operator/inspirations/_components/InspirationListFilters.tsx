"use client";

/**
 * 运营端 · 灵感列表筛选条
 * URL 同步:type / category / q / tag / published。
 * type !== MATERIAL 时隐藏 category;切换 type 会顺手清掉 category。
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  INSPIRATION_TYPES,
  INSPIRATION_TYPE_LABEL,
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABEL,
} from "@/lib/validation/inspiration";

const ALL = "__all";

export default function InspirationListFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const urlType = search.get("type") ?? "";
  const urlCategory = search.get("category") ?? "";
  const urlQ = search.get("q") ?? "";
  const urlTag = search.get("tag") ?? "";
  const urlPublished = search.get("published") ?? "all";

  const [q, setQ] = useState(urlQ);
  const [tag, setTag] = useState(urlTag);
  useEffect(() => setQ(urlQ), [urlQ]);
  useEffect(() => setTag(urlTag), [urlTag]);

  function commit(patch: Record<string, string>) {
    const params = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v && v !== ALL) params.set(k, v);
      else params.delete(k);
    }
    // 切 type → 清掉 category(避免组合非法)
    if (patch.type !== undefined) params.delete("category");
    if (params.has("page")) params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const showCategory = urlType === "MATERIAL";
  const hasAny =
    !!(urlQ || urlTag || urlType || urlCategory || urlPublished !== "all");

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field className="min-w-[220px] flex-1">
        <FieldLabel htmlFor="ins-q">搜索</FieldLabel>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="ins-q"
            value={q}
            placeholder="标题 / 简介…"
            className="pl-7"
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => {
              if (q !== urlQ) commit({ q });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit({ q });
              }
            }}
          />
        </div>
      </Field>

      <Field className="w-40">
        <FieldLabel htmlFor="ins-type">类型</FieldLabel>
        <Select
          value={urlType || ALL}
          onValueChange={(v) => commit({ type: v })}
        >
          <SelectTrigger id="ins-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部</SelectItem>
            {INSPIRATION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {INSPIRATION_TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {showCategory && (
        <Field className="w-40">
          <FieldLabel htmlFor="ins-cat">素材子类</FieldLabel>
          <Select
            value={urlCategory || ALL}
            onValueChange={(v) => commit({ category: v })}
          >
            <SelectTrigger id="ins-cat">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>全部</SelectItem>
              {MATERIAL_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {MATERIAL_CATEGORY_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <Field className="w-40">
        <FieldLabel htmlFor="ins-pub">发布态</FieldLabel>
        <Select
          value={urlPublished || "all"}
          onValueChange={(v) => commit({ published: v === "all" ? "" : v })}
        >
          <SelectTrigger id="ins-pub">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="true">已发布</SelectItem>
            <SelectItem value="false">草稿</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field className="w-36">
        <FieldLabel htmlFor="ins-tag">标签</FieldLabel>
        <Input
          id="ins-tag"
          value={tag}
          placeholder="如 AI创作"
          onChange={(e) => setTag(e.target.value)}
          onBlur={() => {
            if (tag !== urlTag) commit({ tag });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit({ tag });
            }
          }}
        />
      </Field>

      <Button
        type="button"
        variant="outline"
        onClick={() =>
          commit({ q: "", tag: "", type: "", category: "", published: "" })
        }
        disabled={!hasAny}
      >
        <X className="size-3.5" />
        清除
      </Button>
    </div>
  );
}
