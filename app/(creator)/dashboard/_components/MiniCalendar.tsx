import { cn } from "@/lib/utils";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function isoLocal(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type Cell = {
  day: number;
  inMonth: boolean;
  isToday: boolean;
  hasActivity: boolean;
};

/**
 * 紧凑只读月历:展示当前自然月,被标记的日期下方加绿点,今天底色高亮。
 * activityDates 用 "YYYY-MM-DD" 字符串数组传入。
 */
export default function MiniCalendar({
  activityDates,
}: {
  activityDates: string[];
}) {
  const set = new Set(activityDates);
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const todayDate = today.getDate();

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells: Cell[] = [];
  for (let i = firstWeekday; i > 0; i--) {
    cells.push({
      day: prevMonthDays - i + 1,
      inMonth: false,
      isToday: false,
      hasActivity: false,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      inMonth: true,
      isToday: d === todayDate,
      hasActivity: set.has(isoLocal(year, month, d)),
    });
  }
  let next = 1;
  while (cells.length < 42) {
    cells.push({
      day: next++,
      inMonth: false,
      isToday: false,
      hasActivity: false,
    });
  }
  // 最后一行若全是下月填充则裁掉
  const trimmed =
    cells.slice(35).every((c) => !c.inMonth) ? cells.slice(0, 35) : cells;

  return (
    <div>
      <div className="mb-2 text-sm font-medium">
        {year} 年 {month + 1} 月
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[13px]">
        {trimmed.map((c, i) => (
          <div key={i} className="flex items-center justify-center">
            <span
              className={cn(
                "relative inline-flex size-8 items-center justify-center rounded-full",
                !c.inMonth && "text-muted-foreground/40",
                c.inMonth && !c.isToday && "text-foreground",
                c.isToday && "bg-emerald-500 font-medium text-white",
              )}
            >
              {c.day}
              {c.hasActivity && !c.isToday && (
                <span className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-emerald-500" />
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
