import Link from "next/link";
import {
  BookOpen,
  ClipboardList,
  Clock,
  Send,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import MiniCalendar from "./MiniCalendar";

const HOT_TAGS: { label: string; tone: string }[] = [
  { label: "游戏美术", tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
  { label: "角色设计", tone: "bg-red-500/15 text-red-600 dark:text-red-300" },
  { label: "场景设计", tone: "bg-sky-500/15 text-sky-600 dark:text-sky-300" },
  { label: "玩法创意", tone: "bg-pink-500/15 text-pink-600 dark:text-pink-300" },
  { label: "开发日志", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { label: "视频创作", tone: "bg-violet-500/15 text-violet-600 dark:text-violet-300" },
];

export type DashboardStats = {
  enrolled: number;
  submissions: number;
  approved: number;
  pending: number;
};

export default function DashboardAside({
  stats,
  calendarDates,
}: {
  stats: DashboardStats;
  calendarDates: string[];
}) {
  return (
    <>
      <StatsCard {...stats} />
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-medium">活动日历</h3>
        <MiniCalendar activityDates={calendarDates} />
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <HotTagsCard />
        <GuideCard />
      </div>
    </>
  );
}

function StatsCard({
  enrolled,
  submissions,
  approved,
  pending,
}: DashboardStats) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-sm font-medium">数据概览</h3>
        <span className="text-xs text-muted-foreground">全部数据</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="参与活动" value={enrolled} icon={ClipboardList} tone="sky" />
        <StatTile label="投稿数" value={submissions} icon={Send} tone="emerald" />
        <StatTile label="已通过" value={approved} icon={Trophy} tone="amber" />
        <StatTile label="待审核" value={pending} icon={Clock} tone="orange" />
      </div>
    </Card>
  );
}

const TONES = {
  sky: { bg: "bg-sky-50 dark:bg-sky-950/30", iconBg: "bg-sky-500 text-white" },
  emerald: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    iconBg: "bg-emerald-500 text-white",
  },
  amber: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    iconBg: "bg-amber-500 text-white",
  },
  orange: {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    iconBg: "bg-orange-500 text-white",
  },
} as const;

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: keyof typeof TONES;
}) {
  const t = TONES[tone];
  return (
    <div className={cn("rounded-lg p-3", t.bg)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 text-xl font-semibold">{value}</div>
        </div>
        <span
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-full",
            t.iconBg,
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
    </div>
  );
}

function HotTagsCard() {
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-medium">热门标签</h3>
      <div className="flex flex-wrap gap-1.5">
        {HOT_TAGS.map((t) => (
          <Link
            key={t.label}
            href={`/dashboard/activities?q=${encodeURIComponent(t.label)}`}
            className={cn(
              "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80",
              t.tone,
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}

function GuideCard() {
  return (
    <Card className="relative overflow-hidden border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-medium">创作指南</h3>
        <BookOpen className="size-4 text-emerald-600 dark:text-emerald-300" />
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        了解活动规则与投稿技巧。
      </p>
      <Button asChild size="sm" className="mt-3 w-full">
        <Link href="/dashboard/notifications">去查看</Link>
      </Button>
    </Card>
  );
}
