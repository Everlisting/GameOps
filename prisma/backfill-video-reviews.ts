/** 视频库审核上线时执行一次；按平台+作品ID继承旧审核，只写尚未人工审核的视频，可安全重跑。 */
import { prisma } from "../lib/db";
import { statPlatform } from "../lib/operator-submissions";

async function main() {
  let cursor: string | undefined;
  let copied = 0;
  let skipped = 0;
  for (;;) {
    const submissions = await prisma.submission.findMany({
      where: {
        externalId: { not: null },
        OR: [{ status: { not: "PENDING" } }, { reviewTags: { some: {} } }],
      },
      select: {
        id: true,
        platform: true,
        externalId: true,
        status: true,
        titleNote: true,
        contentNote: true,
        yishanNote: true,
        updatedAt: true,
        reviewTags: { select: { id: true } },
      },
      orderBy: { id: "asc" },
      take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!submissions.length) break;
    for (const source of submissions) {
      const changed = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7264231)`;
        const video = await tx.videoStat.findUnique({
          where: {
            platform_externalId: {
              platform: statPlatform(source.platform),
              externalId: source.externalId!,
            },
          },
          select: {
            id: true,
            reviewedAt: true,
            reviewStatus: true,
            reviewTags: { select: { id: true } },
          },
        });
        if (
          !video ||
          video.reviewedAt ||
          video.reviewStatus !== "PENDING" ||
          video.reviewTags.length
        )
          return false;
        const notes = [
          ...new Set(
            [source.titleNote, source.contentNote, source.yishanNote].filter(
              (note): note is string => !!note,
            ),
          ),
        ].join("\n");
        await tx.videoStat.update({
          where: { id: video.id },
          data: {
            reviewStatus: source.status,
            reviewNote: notes || null,
            reviewedAt: source.updatedAt,
            reviewTags: {
              set: source.reviewTags.map((tag) => ({ id: tag.id })),
            },
          },
        });
        return true;
      });
      if (changed) copied++;
      else skipped++;
    }
    cursor = submissions[submissions.length - 1].id;
  }
  process.stdout.write(JSON.stringify({ copied, skipped }) + "\n");
}
main()
  .catch((error: unknown) => {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
