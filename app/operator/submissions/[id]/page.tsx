/**
 * 运营端 · 稿件详情 / 审核
 * 头部:基本信息 + 最终态;主体:三子审核卡片(独立保存)
 */
import Link from "next/link";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { notFound as nextNotFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { SubmissionBadge } from "@/app/(creator)/_components/StatusBadge";
import { ReviewPill } from "../_components/StatusPill";
import SubReviewForm from "../_components/SubReviewForm";

export default async function SubmissionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("OPERATOR");

  const s = await prisma.submission.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      url: true,
      platform: true,
      externalId: true,
      status: true,
      titleStatus: true,
      titleNote: true,
      contentStatus: true,
      contentNote: true,
      yishanStatus: true,
      yishanNote: true,
      createdAt: true,
      updatedAt: true,
      creator: {
        select: {
          id: true,
          nickname: true,
          dyName: true,
          dyAccount: true,
          user: { select: { username: true, email: true } },
        },
      },
      activity: {
        select: { id: true, name: true, status: true, startAt: true, endAt: true },
      },
    },
  });
  if (!s) nextNotFound();

  return (
    <div className="p-8">
      <div className="mb-4">
        <Link
          href="/operator/submissions"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          返回稿件列表
        </Link>
      </div>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-lg font-semibold break-words">{s.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            提交于 {fmtDateTime(s.createdAt)} · 最近更新 {fmtDateTime(s.updatedAt)}
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">最终态</span>
            <SubmissionBadge status={s.status} />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <ReviewPill status={s.titleStatus} label="标" />
            <ReviewPill status={s.contentStatus} label="内" />
            <ReviewPill status={s.yishanStatus} label="易" />
          </div>
        </div>
      </header>

      <div className="mb-6 grid gap-3 lg:grid-cols-3">
        <Card className="p-4">
          <h3 className="mb-2 text-xs text-muted-foreground">稿件链接</h3>
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 break-all text-sm hover:text-primary"
          >
            <ExternalLink className="size-3.5 shrink-0" />
            {s.url}
          </a>
          <div className="mt-2 text-xs text-muted-foreground">
            平台:{s.platform}
            {s.externalId && (
              <span className="ml-3 font-mono opacity-70">
                ID:{s.externalId}
              </span>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-xs text-muted-foreground">创作者</h3>
          <div className="text-sm font-medium">{s.creator.nickname}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            @{s.creator.user.username}
            {s.creator.user.email && ` · ${s.creator.user.email}`}
          </div>
          {(s.creator.dyName || s.creator.dyAccount) && (
            <div className="mt-1 text-xs text-muted-foreground">
              抖音:{s.creator.dyName || "—"}
              {s.creator.dyAccount && ` (${s.creator.dyAccount})`}
            </div>
          )}
          <Link
            href={`/operator/creators/${s.creator.id}`}
            className="mt-2 inline-block text-xs text-primary hover:underline"
          >
            查看创作者详情 →
          </Link>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-xs text-muted-foreground">挂载活动</h3>
          {s.activity ? (
            <>
              <Link
                href={`/operator/activities/${s.activity.id}`}
                className="text-sm font-medium hover:text-primary"
              >
                {s.activity.name}
              </Link>
              <div className="mt-1 text-xs text-muted-foreground">
                {fmtDateTime(s.activity.startAt)} ~ {fmtDateTime(s.activity.endAt)}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">未挂载到任何活动</p>
          )}
        </Card>
      </div>

      <SubReviewForm
        initial={{
          id: s.id,
          title: { status: s.titleStatus, note: s.titleNote ?? "" },
          content: { status: s.contentStatus, note: s.contentNote ?? "" },
          yishan: { status: s.yishanStatus, note: s.yishanNote ?? "" },
        }}
      />
    </div>
  );
}
