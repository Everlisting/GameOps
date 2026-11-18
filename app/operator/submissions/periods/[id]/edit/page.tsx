import { requireRole } from "@/lib/rbac";
import { getSubmissionPeriod } from "@/lib/submission-periods";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import SubmissionPeriodEditor from "../../../_components/SubmissionPeriodEditor";
export default async function EditSubmissionPeriodPage({ params }: { params: { id: string } }) {
  const actor = await requireRole("OPERATOR");
  const period = await getSubmissionPeriod(params.id, actor).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  const assigned = await prisma.$queryRaw<{ videoId: string }[]>`SELECT "videoId" FROM "VideoReviewAssignment" WHERE "periodId" = ${period.id} LIMIT 1`;
  return <div className="flex flex-col gap-6 p-4 md:p-8">
    <header className="flex flex-col gap-2"><h1 className="text-2xl font-semibold tracking-tight">编辑稿件统计</h1><p className="text-sm text-muted-foreground">修改名称或统计周期，保存后重新汇总对应范围的稿件。</p></header>
    <SubmissionPeriodEditor id={period.id} datesLocked={!!assigned.length} initial={{ title: period.title, status: period.status, startDate: period.startDate.toISOString().slice(0, 10), endDate: period.endDate.toISOString().slice(0, 10) }} />
  </div>;
}
