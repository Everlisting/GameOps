"use client";

import { useState } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function parseISODate(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * 共享日期单选输入:URL 串值用 YYYY-MM-DD,UI 显示中文长格式。
 * Calendar 用 shadcn,Popover 选完自动收起。
 * clearable=true 且已有值时,按钮右侧显示灰色 × 用于清空(不会连带打开日历)。
 */
export default function DatePickerField({
  id,
  label,
  value,
  onChange,
  width = "w-44",
  clearable = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** 触发按钮宽度类名,默认 w-44。 */
  width?: string;
  /** 是否显示清除 × 按钮(需 value 非空)。 */
  clearable?: boolean;
}) {
  const date = parseISODate(value);
  const [open, setOpen] = useState(false);

  return (
    <Field className={width}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            data-empty={!date}
            className="justify-start font-normal data-[empty=true]:text-muted-foreground"
          >
            {date ? format(date, "yyyy 年 M 月 d 日") : "选择日期"}
            {clearable && date && (
              <span
                role="button"
                aria-label="清除"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onChange("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    e.preventDefault();
                    onChange("");
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
            mode="single"
            selected={date}
            defaultMonth={date}
            captionLayout="dropdown"
            onSelect={(d) => {
              onChange(d ? format(d, "yyyy-MM-dd") : "");
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
}
