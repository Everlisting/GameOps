"use client";

/**
 * 日期范围单控件:一个按钮触发,弹出两月日历(range 模式)。
 * URL 串值用 YYYY-MM-DD,显示中文短格式「yyyy/M/d ~ yyyy/M/d」。
 *
 * 关键:选择过程用本地 draft 暂存,起止都选好才提交 onChange(触发导航/翻页)——
 * 避免点第一下就 router.push 导致弹层关闭、选不了第二个日期。
 */
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarDays, X } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function parseISODate(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
const toValue = (d: Date) => format(d, "yyyy-MM-dd");
const toLabel = (d: Date) => format(d, "yyyy/M/d");

export default function DateRangeField({
  from,
  to,
  onChange,
  width = "w-64",
  placeholder = "选择日期范围",
  clearable = true,
}: {
  from: string;
  to: string;
  /** 回传起止(YYYY-MM-DD;清空为 "");仅在起止都确定后触发 */
  onChange: (from: string, to: string) => void;
  width?: string;
  placeholder?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);

  // 已提交值(来自 URL props)
  const committed: DateRange | undefined = parseISODate(from)
    ? { from: parseISODate(from), to: parseISODate(to) }
    : undefined;

  // 选择过程中的暂存值;props 变化(外部提交/清空)时同步
  const [draft, setDraft] = useState<DateRange | undefined>(committed);
  useEffect(() => {
    setDraft(parseISODate(from) ? { from: parseISODate(from), to: parseISODate(to) } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const shown = draft;
  const hasValue = !!shown?.from;
  const text = shown?.from
    ? `${toLabel(shown.from)} ~ ${shown.to ? toLabel(shown.to) : "…"}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          data-empty={!hasValue}
          className={cn(
            width,
            "justify-start font-normal data-[empty=true]:text-muted-foreground",
          )}
        >
          <CalendarDays className="size-4 text-muted-foreground" />
          {text}
          {clearable && hasValue && (
            <span
              role="button"
              aria-label="清除"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setDraft(undefined);
                onChange("", "");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  setDraft(undefined);
                  onChange("", "");
                }
              }}
              className="ml-auto rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={draft}
          defaultMonth={draft?.from}
          captionLayout="dropdown"
          // 不依赖 react-day-picker 的 range 累积(v10 首点可能直接给出完整 {from,to}),
          // 自己按「点击的那一天」驱动两步选择:第一下定起始(弹层不关),第二下定终止再提交收起。
          onSelect={(_range, triggerDate) => {
            const prev = draft;
            let next: DateRange;
            if (!prev?.from || prev.to) {
              next = { from: triggerDate, to: undefined }; // 开新范围:只定起始
            } else if (prev.from <= triggerDate) {
              next = { from: prev.from, to: triggerDate };
            } else {
              next = { from: triggerDate, to: prev.from }; // 反选自动交换起止
            }
            setDraft(next);
            if (next.from && next.to) {
              onChange(toValue(next.from), toValue(next.to));
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
