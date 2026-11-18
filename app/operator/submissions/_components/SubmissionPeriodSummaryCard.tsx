import type { SubmissionPeriod } from "@prisma/client";
import { submissionPeriodSummary } from "@/lib/submission-period-summary";
import type { ReviewActor } from "@/lib/video-review-access";
import SubmissionPeriodCard from "./SubmissionPeriodCard";

export default async function SubmissionPeriodSummaryCard({ period, actor, showAction = true }: { period: SubmissionPeriod; actor: ReviewActor; showAction?: boolean }) {
  const startDate = period.startDate.toISOString().slice(0, 10);
  const endDate = period.endDate.toISOString().slice(0, 10);
  const summary = await submissionPeriodSummary(startDate, endDate, actor);
  const query = new URLSearchParams({ from: startDate, to: endDate, status: "PENDING", keepFilters: "1" });
  const action = !showAction ? null : actor.role === "REVIEWER"
    ? { href: `/operator/submissions/review?${query}`, label: "前往审核" }
    : { href: `/operator/submissions/periods/${period.id}`, label: "查看详情" };
  return <SubmissionPeriodCard period={{ id: period.id, title: period.title, status: period.status, startDate, endDate }} summary={summary} action={action} />;
}
