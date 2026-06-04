/**
 * 创作者端 · 活动详情(hero 图片卡片)
 * 顶部大封面 + 标题/状态浮层;下方:描述、报名区、投稿表单、本活动我的投稿。
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarRange,
  Users,
  FileText as FileTextIcon,
  BadgeCheck,
  Wallet,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/creator";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ActivityBadge, SubmissionBadge } from "../../../_components/StatusBadge";
import ActivityCover from "../../../_components/ActivityCover";
import EnrollButton from "../../../_components/EnrollButton";
import SubmissionForm from "../../../_components/SubmissionForm";
import { incentiveDb } from "@/lib/incentive/db";
import type { IncentiveContribution } from "@/lib/incentive/engine";
import { REWARD_KIND_LABEL as KIND_LABEL } from "@/lib/incentive/labels";

export default async function ActivityDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { creator } = await requireCreator();

  const activity = await prisma.activity.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      description: true,
      coverImage: true,
      status: true,
      startAt: true,
      endAt: true,
      _count: { select: { submissions: true, enrollments: true } },
      enrollments: {
        where: { creatorId: creator.id },
        select: { id: true, createdAt: true },
        take: 1,
      },
      submissions: {
        where: { creatorId: creator.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          url: true,
          platform: true,
          status: true,
          reviewNote: true,
          createdAt: true,
        },
      },
    },
  });

  if (!activity) notFound();

  const isOngoing = activity.status === "ONGOING";
  const enrolled = activity.enrollments.length > 0;

  // 阶段5 · 本创作者在本活动下的激励快照(如果运营已"重算过")
  const incentive = await incentiveDb.findUnique({
    where: {
      creatorId_activityId: {
        creatorId: creator.id,
        activityId: activity.id,
      },
    },
  });

  return (
    <div className="p-8 max-w-5xl">
      <Link
        href="/dashboard/activities"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5"
      >
        <ArrowLeft className="size-4" />
        返回活动列表
      </Link>

      <Card className="overflow-hidden mb-6 rounded-2xl">
        <div className="relative aspect-[21/9] bg-zinc-900">
          <ActivityCover src={activity.coverImage} name={activity.name} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6">
            <div className="flex items-center gap-2 mb-2">
              <ActivityBadge status={activity.status} />
              {enrolled && (
                <Badge variant="success">
                  <BadgeCheck className="size-3" />
                  已报名
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {activity.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-300/80">
              <span className="inline-flex items-center gap-1.5">
                <CalendarRange className="size-3.5" />
                {fmtDate(activity.startAt)} ~ {fmtDate(activity.endAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" />
                报名 {activity._count.enrollments}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FileTextIcon className="size-3.5" />
                投稿 {activity._count.submissions}
              </span>
            </div>
          </div>
        </div>

        {activity.description && (
          <div className="p-6 text-sm text-muted-foreground whitespace-pre-line border-t border-border">
            {activity.description}
          </div>
        )}
      </Card>

      <Card className="mb-6 p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm font-medium">参与活动</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {enrolled
                ? `已于 ${fmtDateTime(activity.enrollments[0].createdAt)} 报名`
                : isOngoing
                  ? "尚未报名。报名后可向本活动投稿。"
                  : "活动未在进行中,不可报名。"}
            </div>
          </div>
          {isOngoing && <EnrollButton activityId={activity.id} enrolled={enrolled} />}
        </div>
      </Card>

      {incentive && (() => {
        const estimated = Number(incentive.estimated);
        const adjusted = incentive.adjusted == null ? null : Number(incentive.adjusted);
        const final = adjusted ?? estimated;
        const breakdown = Array.isArray(incentive.breakdown)
          ? (incentive.breakdown as unknown as IncentiveContribution[])
          : [];
        return (
          <Card className="mb-6 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Wallet className="size-4 text-emerald-600 dark:text-emerald-300" />
                  我的预估激励
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">
                  ¥ {final.toFixed(2)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {adjusted != null ? (
                    <>
                      运营已调整 · 系统预估 ¥{estimated.toFixed(2)}
                    </>
                  ) : (
                    <>系统预估,以最终结算为准</>
                  )}
                  <span className="ml-2">
                    · 更新于 {fmtDateTime(incentive.computedAt)}
                  </span>
                </div>
              </div>
            </div>

            {breakdown.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <div className="mb-1.5 text-xs text-muted-foreground">
                  规则贡献明细
                </div>
                <ul className="space-y-1">
                  {breakdown.map((c, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-center gap-2 text-xs"
                    >
                      <Badge variant="outline">#{c.ruleIndex + 1}</Badge>
                      <span className="font-medium">
                        {KIND_LABEL[c.kind] ?? c.kind}
                      </span>
                      {c.note && (
                        <span className="text-muted-foreground">{c.note}</span>
                      )}
                      <span className="tabular-nums">
                        +¥{c.amount.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {adjusted != null && incentive.adjustReason && (
              <div className="mt-3 rounded-md bg-muted/30 px-3 py-2 text-xs">
                <span className="text-muted-foreground">调整说明:</span>{" "}
                {incentive.adjustReason}
              </div>
            )}
          </Card>
        );
      })()}

      <section className="grid md:grid-cols-2 gap-5">
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-3">向本活动投稿</h2>
          {!isOngoing ? (
            <p className="text-sm text-muted-foreground">活动未在进行中,不可投稿。</p>
          ) : !enrolled ? (
            <p className="text-sm text-muted-foreground">请先报名该活动后再投稿。</p>
          ) : (
            <SubmissionForm activities={[]} fixedActivityId={activity.id} />
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-medium mb-3">我的投稿(本活动)</h2>
          {activity.submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有提交过。</p>
          ) : (
            <ul className="divide-y divide-border">
              {activity.submissions.map((s) => (
                <li key={s.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm hover:text-emerald-600 dark:hover:text-emerald-300 truncate block"
                      >
                        {s.title}
                      </a>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {s.platform} · {fmtDateTime(s.createdAt)}
                      </div>
                      {s.reviewNote && (
                        <div className="text-xs text-muted-foreground mt-1">
                          审核备注:{s.reviewNote}
                        </div>
                      )}
                    </div>
                    <SubmissionBadge status={s.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
