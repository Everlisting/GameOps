"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function SubmissionPeriodFilters() {
  const router = useRouter(), pathname = usePathname(), search = useSearchParams();
  const urlQ = search.get("q") ?? "";
  const urlStatus = search.get("status");
  const status = urlStatus === "FROZEN" || urlStatus === "REVIEWING" ? urlStatus : "__all";
  const [q, setQ] = useState(urlQ);
  useEffect(() => setQ(urlQ), [urlQ]);
  function commit(nextStatus = status) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (nextStatus !== "__all") params.set("status", nextStatus);
    router.push(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  }
  return <Card className="shadow-none"><CardContent className="flex flex-wrap items-end gap-3 p-4">
    <Field className="min-w-0 basis-full sm:basis-auto sm:flex-1">
      <FieldLabel htmlFor="period-search">名称搜索</FieldLabel>
      <InputGroup>
        <InputGroupAddon><Search /></InputGroupAddon>
        <InputGroupInput id="period-search" value={q} maxLength={120} placeholder="搜索统计名称" onChange={(event) => setQ(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); commit(); }
        }} />
      </InputGroup>
    </Field>
    <Field className="min-w-0 flex-1 sm:w-40 sm:flex-none">
      <FieldLabel htmlFor="period-status-filter">审核状态</FieldLabel>
      <Select value={status} onValueChange={commit}>
        <SelectTrigger id="period-status-filter"><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>
          <SelectItem value="__all">全部状态</SelectItem>
          <SelectItem value="REVIEWING">审核中</SelectItem>
          <SelectItem value="FROZEN">审核冻结</SelectItem>
        </SelectGroup></SelectContent>
      </Select>
    </Field>
    <Button onClick={() => commit()}>搜索</Button>
    <Button variant="ghost" disabled={!q && status === "__all"} onClick={() => { setQ(""); router.push(pathname, { scroll: false }); }}><X data-icon="inline-start" />重置</Button>
  </CardContent></Card>;
}
