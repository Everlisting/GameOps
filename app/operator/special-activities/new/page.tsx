import { requireRole } from "@/lib/rbac";
import { chinaDateString } from "@/lib/time";
import ActivityEditor from "../_components/ActivityEditor";

export default async function NewSpecialActivityPage() {
  await requireRole("OPERATOR");
  const today = chinaDateString();
  return <div className="flex flex-col gap-5 p-4 sm:p-6 lg:p-8">
    <header><h1 className="text-lg font-semibold">新建专题活动</h1><p className="mt-1 text-sm text-muted-foreground">筛选活动稿件，再为每个奖池组装结算步骤。</p></header>
    <ActivityEditor initial={{ title: "", description: "", startDate: today, endDate: today, filters: { rules: [], match: "ALL" }, pools: [], settlementMode: "CONFIRMATION", cutoffAt: null }} />
  </div>;
}
