import { requireRole } from "@/lib/rbac";
import { monthToDate } from "@/lib/data-period";
import SubmissionPeriodEditor from "../../_components/SubmissionPeriodEditor";
export default async function NewSubmissionPeriodPage() {
  await requireRole("OPERATOR");
  const range = monthToDate();
  return <div className="flex flex-col gap-6 p-4 md:p-8">
    <header className="flex flex-col gap-2"><h1 className="text-2xl font-semibold tracking-tight">新建稿件统计</h1><p className="text-sm text-muted-foreground">填写名称与统计周期，按视频发布时间汇总审核结果。</p></header>
    <SubmissionPeriodEditor initial={{ title: "", startDate: range.from, endDate: range.to, status: "REVIEWING" }} />
  </div>;
}
