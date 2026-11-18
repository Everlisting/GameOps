"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DatePickerField from "@/app/(creator)/_components/DatePickerField";

export default function SubmissionsFilters({
  review,
  activities,
  video = false,
  defaultStatus,
}: {
  review: boolean;
  activities: { id: string; name: string }[];
  video?: boolean;
  defaultStatus?: "ALL" | "PENDING";
}) {
  const router = useRouter(),
    pathname = usePathname(),
    search = useSearchParams();
  const urlQ = search.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  useEffect(() => setQ(urlQ), [urlQ]);
  function commit(patch: Record<string, string>) {
    const params = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value && value !== "__all") params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    params.delete("submissionId");
    params.delete("videoId");
    router.push(`${pathname}${params.size ? `?${params}` : ""}`, {
      scroll: false,
    });
  }
  function dropdown(
    id: string,
    label: string,
    value: string,
    options: { value: string; label: string }[],
  ) {
    return (
      <Field className="min-w-0 w-full sm:w-36">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Select
          value={value}
          onValueChange={(value) => commit({ [id]: value })}
        >
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {options.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    );
  }
  return (
    <FieldGroup className="gap-3">
      <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
        <Field className="col-span-2 min-w-0 flex-1 sm:min-w-48">
          <FieldLabel htmlFor="submission-search">搜索稿件</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              id="submission-search"
              placeholder={
                video ? "搜索作品 ID 或标题" : "搜索标题、稿件 ID 或活动"
              }
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onBlur={() => {
                if (q !== urlQ) commit({ q: q.trim() });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit({ q: q.trim() });
                }
              }}
            />
          </InputGroup>
        </Field>
        {dropdown(
          "status",
          video ? "审核状态" : "审核结果",
          search.get("status") ?? defaultStatus ?? (review ? "PENDING" : "__all"),
          [
            {
              value: review ? "ALL" : "__all",
              label: video ? "全部状态" : "全部结果",
            },
            { value: "PENDING", label: "待审核" },
            { value: "APPROVED", label: "已通过" },
            { value: "REJECTED", label: "未通过" },
          ],
        )}
        {dropdown("platform", "发布平台", search.get("platform") ?? "__all", [
          { value: "__all", label: "全部平台" },
          { value: "douyin", label: "抖音" },
          { value: "bilibili", label: "哔哩哔哩" },
          { value: "xiaohongshu", label: "小红书" },
        ])}
        {video
          ? dropdown(
              "visibility",
              "视频状态",
              search.get("visibility") ?? "active",
              [
                { value: "active", label: "有效视频" },
                { value: "hidden", label: "已隐藏视频" },
                { value: "all", label: "全部视频" },
              ],
            )
          : dropdown(
              "activityId",
              "所属活动",
              search.get("activityId") ?? "__all",
              [
                { value: "__all", label: "全部活动" },
                { value: "__none__", label: "未关联活动" },
                ...activities.map((item) => ({
                  value: item.id,
                  label: item.name,
                })),
              ],
            )}
      </div>
      <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
        <DatePickerField
          id="submission-from"
          width="min-w-0 w-full sm:w-44"
          label={video ? "发布起始日期" : "投稿起始日期"}
          value={search.get("from") ?? ""}
          onChange={(value) => commit({ from: value })}
        />
        <DatePickerField
          id="submission-to"
          width="min-w-0 w-full sm:w-44"
          label={video ? "发布截止日期" : "投稿截止日期"}
          value={search.get("to") ?? ""}
          onChange={(value) => commit({ to: value })}
        />
        {dropdown(
          "pageSize",
          "每页条数",
          search.get("pageSize") ?? "20",
          [20, 50, 100].map((n) => ({ value: String(n), label: `${n} 条` })),
        )}
        <Button
          variant="ghost"
          onClick={() => {
            setQ("");
            router.push(pathname);
          }}
          disabled={!search.size && !q}
        >
          <X data-icon="inline-start" />
          重置筛选
        </Button>
      </div>
    </FieldGroup>
  );
}
