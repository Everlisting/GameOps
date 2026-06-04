"use client";

import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";

/**
 * 活动日历卡片:展示当前月份,参与活动的开始/结束日下方加绿点。
 * dates 用 "YYYY-MM-DD" 字符串数组传入(序列化友好)。
 */
export default function ActivityCalendarCard({ dates }: { dates: string[] }) {
  const activityDays = dates.map((s) => new Date(`${s}T00:00:00`));

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-medium">活动日历</h3>
      <Calendar
        defaultMonth={new Date()}
        modifiers={{ activity: activityDays }}
        modifiersClassNames={{
          activity:
            "relative after:pointer-events-none after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:size-1 after:rounded-full after:bg-emerald-500",
        }}
        className="p-0"
      />
    </Card>
  );
}
