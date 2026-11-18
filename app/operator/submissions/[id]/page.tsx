/** 旧详情审核页停用；旧链接转入新的无作者信息审核工作台。 */
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { statPlatform } from "@/lib/operator-submissions";

export default async function SubmissionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole("OPERATOR");
  const submission = await prisma.submission.findUnique({
    where: { id: params.id },
    select: { id: true, platform: true, externalId: true },
  });
  if (!submission) notFound();
  const video = submission.externalId
    ? await prisma.videoStat.findUnique({
        where: {
          platform_externalId: {
            platform: statPlatform(submission.platform),
            externalId: submission.externalId,
          },
        },
        select: { id: true },
      })
    : null;
  if (video)
    redirect(
      `/operator/submissions/review?status=ALL&visibility=all&videoId=${encodeURIComponent(video.id)}&keepFilters=1`,
    );
  redirect("/operator/submissions");
}
