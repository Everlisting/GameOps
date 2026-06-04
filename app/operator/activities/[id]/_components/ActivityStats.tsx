"use client";

/**
 * 活动详情页顶部统计区:
 *   - 报名人数 + 投稿数 卡片可点 → 弹窗显示具体内容
 *   - 激励规则 卡片是静态展示
 * 数据由父级 server component 预拉(各 200 上限),弹窗只做展示;
 * 投稿弹窗带「去稿件审核」CTA,跳到 /operator/submissions?activityId=... 走完整工作台。
 */
import { forwardRef } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  ExternalLink,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { SubmissionStatus } from "@prisma/client";

import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CreatorAvatar } from "@/components/creator-avatar";
import { SubmissionBadge } from "@/app/(creator)/_components/StatusBadge";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type EnrollmentItem = {
  creatorId: string;
  nickname: string;
  avatarUrl: string | null;
  username: string;
  groupNo: string | null;
  ysId: string | null;
  dyUid: string | null;
  dyName: string | null;
  dyAccount: string | null;
  enrolledAt: string; // ISO
};

export type SubmissionItem = {
  id: string;
  title: string;
  url: string;
  status: SubmissionStatus;
  createdAt: string; // ISO
  creator: { nickname: string };
};

export default function ActivityStats({
  activityId,
  enrollmentCount,
  submissionCount,
  rulesCount,
  enrollments,
  submissions,
  listLimit,
}: {
  activityId: string;
  enrollmentCount: number;
  submissionCount: number;
  rulesCount: number;
  enrollments: EnrollmentItem[];
  submissions: SubmissionItem[];
  listLimit: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Dialog>
        <DialogTrigger asChild>
          <ClickableStatCard
            label="报名人数"
            value={enrollmentCount}
            icon={Users}
          />
        </DialogTrigger>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>报名创作者 · {enrollmentCount} 人</DialogTitle>
            <DialogDescription>
              {enrollmentCount > listLimit
                ? `按报名时间倒序,仅展示最近 ${listLimit} 条。`
                : "按报名时间倒序展示。"}
            </DialogDescription>
          </DialogHeader>
          {enrollments.length === 0 ? (
            <EmptyHint text="暂无报名。" />
          ) : (
            <ul className="-mr-2 max-h-[65vh] divide-y divide-border overflow-y-auto pr-2">
              {enrollments.map((c) => (
                <li key={c.creatorId} className="flex items-start gap-3 py-3">
                  <CreatorAvatar
                    avatar={c.avatarUrl}
                    name={c.nickname}
                    className="size-9 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link
                        href={`/operator/creators/${c.creatorId}`}
                        className="line-clamp-1 text-sm font-medium hover:text-primary"
                      >
                        {c.nickname}
                      </Link>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        报名于 {fmtDate(c.enrolledAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      @{c.username}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                      <InfoField label="团号" value={c.groupNo} mono />
                      <InfoField label="易闪 ID" value={c.ysId} mono />
                      <InfoField label="抖音 UID" value={c.dyUid} mono />
                      <InfoField label="抖音昵称" value={c.dyName} />
                      <InfoField label="抖音号" value={c.dyAccount} mono />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger asChild>
          <ClickableStatCard
            label="投稿数"
            value={submissionCount}
            icon={ClipboardList}
          />
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>投稿 · {submissionCount} 条</DialogTitle>
            <DialogDescription>
              {submissionCount > listLimit
                ? `按提交时间倒序,仅展示最近 ${listLimit} 条。点稿件标题进详情;右下角进完整审核工作台。`
                : "按提交时间倒序展示。点稿件标题进详情;右下角进完整审核工作台。"}
            </DialogDescription>
          </DialogHeader>
          {submissions.length === 0 ? (
            <EmptyHint text="暂无投稿。" />
          ) : (
            <ul className="-mr-2 max-h-[60vh] divide-y divide-border overflow-y-auto pr-2">
              {submissions.map((s) => (
                <li key={s.id} className="flex items-start gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <Link
                        href={`/operator/submissions/${s.id}`}
                        className="line-clamp-1 flex-1 text-sm font-medium hover:text-primary"
                      >
                        {s.title}
                      </Link>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        title="打开原链接"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      @{s.creator.nickname} · {fmtDateTime(s.createdAt)}
                    </div>
                  </div>
                  <SubmissionBadge status={s.status} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-center justify-end">
            <Link
              href={`/operator/submissions?activityId=${activityId}`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              去稿件审核工作台
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </DialogContent>
      </Dialog>

      <StaticStatCard label="激励规则" value={rulesCount} suffix="条" />
    </div>
  );
}

function StaticStatCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {suffix && (
          <span className="text-xs text-muted-foreground">{suffix}</span>
        )}
      </div>
    </Card>
  );
}

/**
 * DialogTrigger asChild 会把 trigger 行为透传给这里的 button(注入 ref + 点击)。
 */
type ClickableStatCardProps = {
  label: string;
  value: number;
  icon: LucideIcon;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const ClickableStatCard = forwardRef<HTMLButtonElement, ClickableStatCardProps>(
  function ClickableStatCard(
    { label, value, icon: Icon, className, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        {...props}
        className={cn(
          "group text-left transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          className,
        )}
      >
        <Card className="p-4 transition-colors group-hover:border-primary/40 group-hover:bg-muted/40">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs text-muted-foreground">{label}</div>
            <Icon className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-semibold tabular-nums">{value}</span>
            <span className="text-xs text-muted-foreground transition-colors group-hover:text-primary">
              查看详情 →
            </span>
          </div>
        </Card>
      </button>
    );
  },
);

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

/**
 * 创作者基础信息小标签:空值整行不渲染,避免视觉噪声。
 */
function InfoField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "max-w-[14ch] truncate text-foreground",
          mono && "font-mono",
        )}
        title={value}
      >
        {value}
      </span>
    </span>
  );
}
