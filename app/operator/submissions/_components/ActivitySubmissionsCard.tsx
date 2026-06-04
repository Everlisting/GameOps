/**
 * 运营端 · 稿件管理 · 活动汇总卡片
 * 每张卡片代表一个活动,显示封面 + 状态 + 起止 + 三态计数;
 * 点击卡片打开该活动的稿件审核表格(?activityId=)。
 * 卡片 hover 时封面图轻微放大,与活动列表一致。
 */
import Link from "next/link";
import type { ActivityStatus, SubmissionStatus } from "@prisma/client";
import { ArrowRight, ClipboardList, Inbox } from "lucide-react";

import { Card } from "@/components/ui/card";
import { fmtDate } from "@/lib/format";
import { ActivityBadge } from "@/app/(creator)/_components/StatusBadge";
import ActivityCover from "@/app/(creator)/_components/ActivityCover";

export type SubmissionCounts = Record<SubmissionStatus, number>;

export type ActivitySubmissionsCardData = {
  id: string | null; // null = 未挂活动
  name: string;
  coverImage: string | null;
  status: ActivityStatus | null;
  startAt: Date | null;
  endAt: Date | null;
  counts: SubmissionCounts;
};

const STATUS_TONE: Record<
  SubmissionStatus,
  { label: string; cls: string }
> = {
  PENDING: {
    label: "待审",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  APPROVED: {
    label: "已通过",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  REJECTED: {
    label: "未通过",
    cls: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
};

export default function ActivitySubmissionsCard({
  data,
  href,
  highlight,
}: {
  data: ActivitySubmissionsCardData;
  /** 点击卡片去哪;通常是 /operator/submissions?activityId=... */
  href: string;
  /** 高亮某个状态的计数(对应 sidebar 选中的状态) */
  highlight?: SubmissionStatus;
}) {
  const total =
    data.counts.PENDING + data.counts.APPROVED + data.counts.REJECTED;

  return (
    <li>
      <Link href={href} className="group block focus:outline-none">
        <Card className="flex h-full flex-col overflow-hidden p-0 transition-shadow hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring/50">
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            {data.id ? (
              <ActivityCover
                src={data.coverImage}
                name={data.name}
                className="transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                <Inbox className="size-10" />
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
            <div className="absolute left-2 top-2">
              {data.status && <ActivityBadge status={data.status} />}
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3 p-4">
            <div className="min-w-0">
              <h3 className="line-clamp-1 text-sm font-medium transition-colors group-hover:text-primary">
                {data.name}
              </h3>
              <p className="mt-1 line-clamp-1 h-4 text-xs leading-4 text-muted-foreground">
                {data.startAt && data.endAt
                  ? `${fmtDate(data.startAt)} ~ ${fmtDate(data.endAt)}`
                  : "未关联活动"}
              </p>
            </div>

            <div className="mt-auto space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(["PENDING", "APPROVED", "REJECTED"] as SubmissionStatus[]).map(
                  (s) => (
                    <CountChip
                      key={s}
                      status={s}
                      value={data.counts[s]}
                      highlight={highlight === s}
                    />
                  ),
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <ClipboardList className="size-3.5" />
                  <span>共 </span>
                  <span className="tabular-nums">{total}</span>
                  <span> 条稿件</span>
                </span>
                <span className="inline-flex items-center gap-0.5 text-foreground/80 group-hover:text-primary">
                  审核
                  <ArrowRight className="size-3" />
                </span>
              </div>
            </div>
          </div>
        </Card>
      </Link>
    </li>
  );
}

function CountChip({
  status,
  value,
  highlight,
}: {
  status: SubmissionStatus;
  value: number;
  highlight?: boolean;
}) {
  const t = STATUS_TONE[status];
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium",
        t.cls,
        highlight ? "ring-1 ring-current/40" : "",
      ].join(" ")}
    >
      <span className="opacity-80">{t.label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}
