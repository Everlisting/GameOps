/**
 * 运营端 · 活动管理 · 详情/编辑
 * 顶部统计 + 状态切换 + ActivityForm 复用编辑。
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { notFound as nextNotFound } from "next/navigation";
import {
  rewardRulesSchema,
  type RewardRule,
} from "@/lib/validation/activity";
import { autoTransitionActivities } from "@/lib/activity-publish";
import ActivityForm from "../_components/ActivityForm";
import ActivityActions from "../_components/ActivityActions";
import ActivityStats, {
  type EnrollmentItem,
  type SubmissionItem,
} from "./_components/ActivityStats";
import IncentiveSection from "./_components/IncentiveSection";

/** 弹窗内最多展示多少条;超出走「去稿件审核」走完整页 */
const DIALOG_LIST_LIMIT = 200;

function fmtLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function ActivityDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("OPERATOR");

  // 读时懒触发状态转移:DRAFT→ONGOING(publishAt 到点)+ ONGOING→ENDED(endAt 到点)
  await autoTransitionActivities();

  const a = await prisma.activity.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      description: true,
      coverImage: true,
      status: true,
      startAt: true,
      endAt: true,
      publishAt: true,
      rewardRules: true,
      updatedAt: true,
      _count: { select: { submissions: true, enrollments: true } },
    },
  });
  if (!a) nextNotFound();

  // rewardRules 是 Prisma.JsonValue,先经 Zod 校验再传给客户端表单。
  // 老数据可能是 {} 或不合法,安全降级为空数组。
  const parsed = rewardRulesSchema.safeParse(a.rewardRules);
  const rules: RewardRule[] = parsed.success ? parsed.data : [];

  // 预拉弹窗用的列表(各 200 条)。性能上够看,超额引导用户去稿件工作台分页。
  const [enrolls, subs] = await Promise.all([
    prisma.activityEnrollment.findMany({
      where: { activityId: a.id },
      orderBy: { createdAt: "desc" },
      take: DIALOG_LIST_LIMIT,
      select: {
        creatorId: true,
        createdAt: true,
        creator: {
          select: {
            nickname: true,
            avatarUrl: true,
            groupNo: true,
            ysId: true,
            dyUid: true,
            dyName: true,
            dyAccount: true,
            user: { select: { username: true } },
          },
        },
      },
    }),
    prisma.submission.findMany({
      where: { activityId: a.id },
      orderBy: { createdAt: "desc" },
      take: DIALOG_LIST_LIMIT,
      select: {
        id: true,
        title: true,
        url: true,
        status: true,
        createdAt: true,
        creator: { select: { nickname: true } },
      },
    }),
  ]);

  const enrollmentItems: EnrollmentItem[] = enrolls.map((e) => ({
    creatorId: e.creatorId,
    nickname: e.creator.nickname,
    avatarUrl: e.creator.avatarUrl,
    username: e.creator.user.username,
    groupNo: e.creator.groupNo,
    ysId: e.creator.ysId,
    dyUid: e.creator.dyUid,
    dyName: e.creator.dyName,
    dyAccount: e.creator.dyAccount,
    enrolledAt: e.createdAt.toISOString(),
  }));
  const submissionItems: SubmissionItem[] = subs.map((s) => ({
    id: s.id,
    title: s.title,
    url: s.url,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    creator: s.creator,
  }));

  return (
    <div className="p-8">
      <div className="mb-4">
        <Link
          href="/operator/activities"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          返回活动列表
        </Link>
      </div>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{a.name}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            上次更新 {fmtDateTime(a.updatedAt)}
          </p>
        </div>
        <ActivityActions id={a.id} status={a.status} />
      </header>

      <div className="mb-6">
        <ActivityStats
          activityId={a.id}
          enrollmentCount={a._count.enrollments}
          submissionCount={a._count.submissions}
          rulesCount={rules.length}
          enrollments={enrollmentItems}
          submissions={submissionItems}
          listLimit={DIALOG_LIST_LIMIT}
        />
      </div>

      <ActivityForm
        mode="edit"
        status={a.status}
        initial={{
          id: a.id,
          name: a.name,
          description: a.description ?? "",
          coverImage: a.coverImage ?? "",
          startAt: fmtLocal(a.startAt),
          endAt: fmtLocal(a.endAt),
          publishAt: a.publishAt ? fmtLocal(a.publishAt) : "",
          rewardRules: rules,
        }}
        bottomSlot={
          <IncentiveSection activityId={a.id} hasRules={rules.length > 0} />
        }
      />
    </div>
  );
}

