import { requireRole } from "@/lib/rbac";
import { loadSubmissionPeriods, periodSearch, type SubmissionPeriodSearch } from "@/lib/submission-periods";
import { hasRole } from "@/lib/roles";
import SubmissionPeriodsWorkspace from "./_components/SubmissionPeriodsWorkspace";

export default async function OperatorSubmissionsPage({ searchParams = {} }: { searchParams?: SubmissionPeriodSearch }) {
  const actor = await requireRole("REVIEWER");
  const filters = periodSearch(searchParams);
  const periods = await loadSubmissionPeriods(searchParams, actor);
  return <SubmissionPeriodsWorkspace periods={periods} actor={actor} canManage={hasRole(actor.role, "OPERATOR")} filtered={!!(filters.q || filters.status)} />;
}
