"use client";

/**
 * 运营端共享 datetime 选择器:Popover + Calendar(日期)+ 时间 Input(HH:mm)。
 * 字符串协议沿用原生 datetime-local:YYYY-MM-DDTHH:mm,便于直接喂回 ActivityForm。
 * 与创作者端 DatePickerField 风格一致(同样 Popover + shadcn Calendar)。
 */
import { useState } from "react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function parse(s: string): { date: Date | undefined; time: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (!m) return { date: undefined, time: "" };
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  if (Number.isNaN(d.getTime())) return { date: undefined, time: "" };
  return { date: d, time: `${m[4]}:${m[5]}` };
}

export default function DateTimePickerField({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { date, time } = parse(value);
  const [open, setOpen] = useState(false);

  function emit(nextDate: Date | undefined, nextTime: string) {
    if (!nextDate || !/^\d{2}:\d{2}$/.test(nextTime)) {
      onChange("");
      return;
    }
    onChange(`${format(nextDate, "yyyy-MM-dd")}T${nextTime}`);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          data-empty={!date || !time}
          className="w-full justify-start font-normal data-[empty=true]:text-muted-foreground"
        >
          {date && time
            ? `${format(date, "yyyy 年 M 月 d 日")} ${time}`
            : "选择日期与时间"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          captionLayout="dropdown"
          onSelect={(d) => emit(d ?? undefined, time || "09:00")}
        />
        <div className="flex items-center gap-2 border-t border-border p-2">
          <span className="text-xs text-muted-foreground">时间</span>
          <Input
            type="time"
            value={time}
            step={60}
            onChange={(e) => emit(date, e.target.value)}
            className="h-8 w-32"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto text-xs"
            onClick={() => setOpen(false)}
          >
            完成
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
