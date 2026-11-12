import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { activityInput } from "@/lib/special-activities/db";
import ActivityEditor from "../../_components/ActivityEditor";

export default async function EditSpecialActivityPage({ params }: { params: { id: string } }) {
  await requireRole("OPERATOR");
  const activity = await prisma.specialActivity.findUnique({ where: { id: params.id } });
  if (!activity) notFound();
  if (activity.settledAt) redirect(`/operator/special-activities/${activity.id}`);
  return <div className="flex flex-col gap-5 p-4 sm:p-6 lg:p-8">
    <header><h1 className="text-lg font-semibold">编辑专题活动</h1><p className="mt-1 text-sm text-muted-foreground">{activity.title}</p></header>
    <ActivityEditor initial={activityInput(activity)} editing={{ id: activity.id, revision: activity.revision }} />
  </div>;
}
