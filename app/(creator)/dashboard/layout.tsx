/**
 * 创作者端 · /dashboard 下统一布局
 * 左主区 = 子路由 page;右侧 sticky 固定侧栏(数据概览/活动日历/热门标签/创作指南)。
 * 活动详情页(/dashboard/activities/[id])由 DashboardShell 客户端 pathname 判断,不显示右侧栏。
 */
import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/creator";
import DashboardAside from "./_components/DashboardAside";
import DashboardShell from "./_components/DashboardShell";

function toISODateLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { creator } = await requireCreator();

  const [enrollmentCount, submissionStats, calendarEnrollments] =
    await Promise.all([
      prisma.activityEnrollment.count({ where: { creatorId: creator.id } }),
      prisma.submission.groupBy({
        by: ["status"],
        where: { creatorId: creator.id },
        _count: { _all: true },
      }),
      prisma.activityEnrollment.findMany({
        where: { creatorId: creator.id },
        select: { activity: { select: { startAt: true, endAt: true } } },
      }),
    ]);

  const submissions = submissionStats.reduce((a, b) => a + b._count._all, 0);
  const approved =
    submissionStats.find((b) => b.status === "APPROVED")?._count._all ?? 0;
  const pending =
    submissionStats.find((b) => b.status === "PENDING")?._count._all ?? 0;

  const calendarDates = Array.from(
    new Set(
      calendarEnrollments.flatMap((e) => [
        toISODateLocal(e.activity.startAt),
        toISODateLocal(e.activity.endAt),
      ]),
    ),
  );

  return (
    <DashboardShell
      sidebar={
        <DashboardAside
          stats={{ enrolled: enrollmentCount, submissions, approved, pending }}
          calendarDates={calendarDates}
        />
      }
    >
      {children}
    </DashboardShell>
  );
}
