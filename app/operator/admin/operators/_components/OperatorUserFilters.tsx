"use client";

/**
 * 管理员 · 运营账户管理 · 筛选条
 * 文本输入按回车 / 失焦提交,角色 / 状态 onChange 即提交。
 * 复用创作者端 ActivityFilters 的 commit + Field 模式,UI 改用 shadcn Select。
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

const ALL = "__all";

export default function OperatorUserFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const urlQ = search.get("q") ?? "";
  const urlRole = search.get("role") ?? "";
  const urlStatus = search.get("status") ?? "";

  const [q, setQ] = useState(urlQ);
  useEffect(() => setQ(urlQ), [urlQ]);

  function commit(patch: Record<string, string>) {
    const params = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const hasAny = !!(urlQ || urlRole || urlStatus);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-end">
      <Field>
        <FieldLabel htmlFor="op-q">用户名</FieldLabel>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="op-q"
            value={q}
            placeholder="按用户名搜索…"
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

      <Field className="w-36">
        <FieldLabel htmlFor="op-role">角色</FieldLabel>
        <Select
          value={urlRole || ALL}
          onValueChange={(v) => commit({ role: v === ALL ? "" : v })}
        >
          <SelectTrigger id="op-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部角色</SelectItem>
            <SelectItem value="OPERATOR">运营</SelectItem>
            <SelectItem value="ADMIN">管理员</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field className="w-36">
        <FieldLabel htmlFor="op-status">状态</FieldLabel>
        <Select
          value={urlStatus || ALL}
          onValueChange={(v) => commit({ status: v === ALL ? "" : v })}
        >
          <SelectTrigger id="op-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部状态</SelectItem>
            <SelectItem value="active">已启用</SelectItem>
            <SelectItem value="disabled">已停用</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Button
        type="button"
        variant="outline"
        onClick={() => commit({ q: "", role: "", status: "" })}
        disabled={!hasAny}
      >
        <X className="size-3.5" />
        清除
      </Button>
    </div>
  );
}
