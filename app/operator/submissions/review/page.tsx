import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { loadVideoReviews, type VideoReviewSearch } from "@/lib/video-reviews";
import { flattenReviewTags } from "@/lib/review-tags";
import { loadSubmissionPeriods } from "@/lib/submission-periods";
import VideoReviewWorkspace from "../_components/VideoReviewWorkspace";
import ReviewPeriodCards from "../_components/ReviewPeriodCards";

export default async function SubmissionReviewPage({
  searchParams = {},
}: {
  searchParams?: VideoReviewSearch;
}) {
  const actor = await requireRole("REVIEWER");
  const [data, tags, periods] = await Promise.all([
    loadVideoReviews(searchParams, actor),
    prisma.reviewTag.findMany(),
    loadSubmissionPeriods({}, actor),
  ]);
  return (
    <VideoReviewWorkspace
      key={JSON.stringify({ ...searchParams, keepFilters: undefined })}
      data={data}
      searchParams={searchParams}
      tags={flattenReviewTags(tags)}
      reviewerOnly={actor.role === "REVIEWER"}
      periods={periods.map((period) => ({
        id: period.id,
        title: period.title,
        startDate: period.startDate.toISOString().slice(0, 10),
        endDate: period.endDate.toISOString().slice(0, 10),
      }))}
      periodCards={<ReviewPeriodCards periods={periods} actor={actor} />}
    />
  );
}
