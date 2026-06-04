/**
 * 运营端 · 创作者详情 / 编辑
 * 顶部:头像 + 昵称 + 账户状态切换;
 * 内容:档案编辑表单 + 账户信息卡 + 投稿统计卡
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound as nextNotFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { CreatorAvatar } from "@/components/creator-avatar";
import { SubmissionBadge } from "@/app/(creator)/_components/StatusBadge";
import CreatorActions from "../_components/CreatorActions";
import CreatorEditForm from "../_components/CreatorEditForm";

export default async function CreatorDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("OPERATOR");

  const c = await prisma.creator.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      nickname: true,
      avatarUrl: true,
      tier: true,
      groupNo: true,
      ysId: true,
      dyUid: true,
      dyName: true,
      dyAccount: true,
      dyUrl: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          status: true,
          createdAt: true,
        },
      },
      _count: { select: { submissions: true, enrollments: true } },
    },
  });
  if (!c) nextNotFound();

  const subStats = await prisma.submission.groupBy({
    by: ["status"],
    where: { creatorId: c.id },
    _count: { _all: true },
  });
  const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 } as const;
  const m: Record<"PENDING" | "APPROVED" | "REJECTED", number> = { ...counts };
  for (const s of subStats) m[s.status] = s._count._all;

  return (
    <div className="p-8">
      <div className="mb-4">
        <Link
          href="/operator/creators"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          返回创作者列表
        </Link>
      </div>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <CreatorAvatar
            avatar={c.avatarUrl}
            name={c.nickname}
            className="h-12 w-12"
          />
          <div>
            <h1 className="text-lg font-semibold">{c.nickname}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              @{c.user.username} · 注册于 {fmtDate(c.user.createdAt)}
            </p>
          </div>
        </div>
        <CreatorActions id={c.id} status={c.user.status} />
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="报名活动" value={c._count.enrollments} />
        <StatCard label="总投稿" value={c._count.submissions} />
        <StatCard label="已通过" value={m.APPROVED} tone="ok" />
        <StatCard label="待审核" value={m.PENDING} tone="warn" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <CreatorEditForm
          initial={{
            id: c.id,
            nickname: c.nickname,
            tier: c.tier ?? "",
            groupNo: c.groupNo ?? "",
            ysId: c.ysId ?? "",
            dyUid: c.dyUid ?? "",
            dyName: c.dyName ?? "",
            dyAccount: c.dyAccount ?? "",
            dyUrl: c.dyUrl ?? "",
          }}
        />

        <div className="space-y-4">
          <Card className="space-y-2 p-4">
            <h3 className="text-sm font-medium">账户信息</h3>
            <Row label="用户名" value={c.user.username} mono />
            <Row label="邮箱" value={c.user.email ?? "—"} />
            <Row label="创建于" value={fmtDate(c.user.createdAt)} />
            <p className="pt-1 text-[11px] text-muted-foreground">
              邮箱/密码由创作者本人在「账户设置」修改。
            </p>
          </Card>

          <Card className="space-y-2 p-4">
            <h3 className="text-sm font-medium">投稿状态分布</h3>
            <Row
              label="已通过"
              value={String(m.APPROVED)}
              badge={<SubmissionBadge status="APPROVED" />}
            />
            <Row
              label="待审核"
              value={String(m.PENDING)}
              badge={<SubmissionBadge status="PENDING" />}
            />
            <Row
              label="未通过"
              value={String(m.REJECTED)}
              badge={<SubmissionBadge status="REJECTED" />}
            />
            <Link
              href={`/operator/submissions?creatorId=${c.id}`}
              className="block pt-1 text-xs text-primary hover:underline"
            >
              查看 TA 的全部稿件 →
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}) {
  const cls =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-300"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-300"
        : "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${cls}`}>
        {value}
      </div>
    </Card>
  );
}

function Row({
  label,
  value,
  mono,
  badge,
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`min-w-0 truncate text-right ${mono ? "font-mono text-xs" : ""}`}
      >
        {badge ?? value}
      </span>
    </div>
  );
}
