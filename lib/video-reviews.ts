import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { flattenReviewTags } from "@/lib/review-tags";
import { validateVideoReview } from "@/lib/video-review-validation";
import { submissionDate, submissionStatus } from "@/lib/operator-submissions";
import type { SessionPayload } from "@/lib/session";
import type { z } from "zod";
import type { videoReviewSchema } from "@/lib/validation/video-review";
import { assignedReviewWhere, assertAssignedVideos, ensureReviewActor, lockReviewAssignments, type ReviewActor } from "@/lib/video-review-access";
import { videoReviewAuditWhere } from "@/lib/video-review-history";

export type VideoReviewSearch = {
  reviewPeriod?: string;
  q?: string;
  status?: string;
  platform?: string;
  visibility?: string;
  from?: string;
  to?: string;
  page?: string | number;
  pageSize?: string | number;
  videoId?: string;
};
export const videoReviewSelect = {
  id: true,
  platform: true,
  externalId: true,
  title: true,
  url: true,
  publishedAt: true,
  reviewStatus: true,
  reviewerName: true,
  reviewedAt: true,
  reviewNote: true,
  reviewTags: { select: { id: true, name: true } },
} satisfies Prisma.VideoStatSelect;

export function buildVideoReviewWhere(
  search: VideoReviewSearch,
): Prisma.VideoStatWhereInput {
  const q = search.q?.trim() ?? "";
  const status = submissionStatus(search.status ?? "PENDING");
  const from = submissionDate(search.from),
    to = submissionDate(search.to, true);
  return {
    ...(search.visibility === "all"
      ? {}
      : { hidden: search.visibility === "hidden" }),
    ...(status ? { reviewStatus: status } : {}),
    ...(search.platform ? { platform: search.platform } : {}),
    ...(from || to ? { publishedAt: { gte: from, lte: to } } : {}),
    ...(search.videoId ? { id: search.videoId } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { externalId: { contains: q, mode: "insensitive" } },
            { creatorUid: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function loadVideoReviews(search: VideoReviewSearch, actor: ReviewActor) {
  ensureReviewActor(actor);
  const where = buildVideoReviewWhere({
    ...search,
    status: search.status ?? (actor.role === "REVIEWER" ? "PENDING" : "ALL"),
  });
  const pageSize = [20, 50, 100].includes(Number(search.pageSize))
    ? Number(search.pageSize)
    : 20;
  const [total, pendingTotal] = actor.role === "REVIEWER" ? await Promise.all([
    prisma.$queryRaw<{ count: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS count FROM "VideoStat" v WHERE ${assignedReviewWhere(search, actor)}`).then(([row]) => row.count),
    prisma.$queryRaw<{ count: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS count FROM "VideoStat" v WHERE ${assignedReviewWhere({ ...search, status: "PENDING", videoId: undefined }, actor)}`).then(([row]) => row.count),
  ]) : await Promise.all([
    prisma.videoStat.count({ where }),
    prisma.videoStat.count({
      where: buildVideoReviewWhere({
        ...search,
        status: "PENDING",
        videoId: undefined,
      }),
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(
    totalPages,
    Math.max(
      1,
      Number.isSafeInteger(Number(search.page)) ? Number(search.page) : 1,
    ),
  );
  const assignedPage = actor.role === "REVIEWER" ? await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT v."id" FROM "VideoStat" v WHERE ${assignedReviewWhere(search, actor)}
    ORDER BY v."publishedAt" ASC NULLS LAST, v."id" ASC OFFSET ${(page - 1) * pageSize} LIMIT ${pageSize}
  `) : null;
  const items = await prisma.videoStat.findMany({
    where: assignedPage ? { id: { in: assignedPage.map((row) => row.id) } } : where,
    select: videoReviewSelect,
    orderBy: actor.role === "REVIEWER"
      ? [{ publishedAt: { sort: "asc", nulls: "last" } }, { id: "asc" }]
      : [{ reviewedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    skip: assignedPage ? 0 : (page - 1) * pageSize,
    take: pageSize,
  });
  return {
    rows: items.map((video) => ({
      ...video,
      publishedAt: video.publishedAt?.toISOString() ?? null,
      reviewedAt: video.reviewedAt?.toISOString() ?? null,
    })),
    total,
    pendingTotal,
    page,
    pageSize,
    totalPages,
  };
}
export type VideoReviewRow = Awaited<
  ReturnType<typeof loadVideoReviews>
>["rows"][number];

/** 稳定游标不依赖分页偏移；保存后不会因待审数量缩小而跳过下一条。 */
export async function nextVideoReview(
  search: VideoReviewSearch,
  afterId: string | undefined,
  actor: ReviewActor,
): Promise<VideoReviewRow | null> {
  ensureReviewActor(actor);
  const scope = buildVideoReviewWhere({
    ...search,
    status: "PENDING",
    videoId: undefined,
  });
  let after: Prisma.VideoStatWhereInput | undefined;
  let cursorSql = Prisma.sql`TRUE`;
  if (afterId) {
    await assertAssignedVideos(prisma, [afterId], actor);
    const anchor = await prisma.videoStat.findUnique({
      where: { id: afterId },
      select: { id: true, publishedAt: true },
    });
    if (!anchor) throw notFound("当前视频已不存在，请关闭后重新开始审核");
    after = anchor.publishedAt
      ? {
          OR: [
            { publishedAt: { gt: anchor.publishedAt } },
            { publishedAt: anchor.publishedAt, id: { gt: anchor.id } },
            { publishedAt: null },
          ],
        }
      : { publishedAt: null, id: { gt: anchor.id } };
    cursorSql = anchor.publishedAt
      ? Prisma.sql`(v."publishedAt" > ${anchor.publishedAt} OR (v."publishedAt" = ${anchor.publishedAt} AND v."id" > ${anchor.id}) OR v."publishedAt" IS NULL)`
      : Prisma.sql`(v."publishedAt" IS NULL AND v."id" > ${anchor.id})`;
  }
  const assignedNext = actor.role === "REVIEWER" ? await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT v."id" FROM "VideoStat" v
    WHERE ${assignedReviewWhere({ ...search, status: "PENDING", videoId: undefined }, actor)} AND ${cursorSql}
    ORDER BY v."publishedAt" ASC NULLS LAST, v."id" ASC LIMIT 1
  `) : null;
  const video = assignedNext ? (assignedNext[0] ? await prisma.videoStat.findUnique({ where: { id: assignedNext[0].id }, select: videoReviewSelect }) : null) : await prisma.videoStat.findFirst({
    where: after ? { AND: [scope, after] } : scope,
    select: videoReviewSelect,
    orderBy: [{ publishedAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
  });
  return video
    ? {
        ...video,
        publishedAt: video.publishedAt?.toISOString() ?? null,
        reviewedAt: video.reviewedAt?.toISOString() ?? null,
      }
    : null;
}

/** 与标签管理共用锁，避免选用已停用标签及删除/修改层级的竞态。 */
export async function saveVideoReview(
  id: string,
  patch: z.infer<typeof videoReviewSchema>,
  actor: SessionPayload,
) {
  return prisma.$transaction(async (tx) => {
    await lockReviewAssignments(tx);
    await assertAssignedVideos(tx, [id], actor);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7264231)`;
    const current = await tx.videoStat.findUnique({
      where: { id },
      select: { id: true, reviewStatus: true, reviewedAt: true, reviewerName: true, reviewNote: true, reviewTags: { select: { id: true } } },
    });
    if (!current) throw notFound("视频不存在");
    const tags = await tx.reviewTag.findMany();
    const flattened = flattenReviewTags(tags);
    const available = new Set(
      flattened
        .filter((tag) => tag.available)
        .map((tag) => tag.id),
    );
    const retained = new Set(current.reviewTags.map((tag) => tag.id));
    if (
      patch.tagIds.some(
        (tagId) => !available.has(tagId) && !retained.has(tagId),
      )
    ) {
      throw badRequest("部分标签已停用或不存在，请刷新后重试");
    }
    const validation = validateVideoReview(patch.status, patch.tagIds, tags);
    const message = validation.status ?? validation.tag?.message;
    if (message) throw badRequest(message);
    const tagSnapshots = (ids: string[]) => [...new Set(ids)].map((tagId) => {
      const tag = flattened.find((item) => item.id === tagId);
      return { id: tagId, name: tag?.name ?? tagId, path: tag?.path ?? `已删除标签（${tagId}）` };
    });
    // 早期导入/未留审计的视频，在首次覆盖前保留唯一可恢复的旧状态。
    if (current.reviewedAt && !(await tx.auditLog.count({ where: videoReviewAuditWhere(id) }))) {
      await tx.auditLog.create({ data: {
        actorId: null, actorUsername: "<historical>", action: "video.review", targetType: "video", targetId: id,
        createdAt: current.reviewedAt,
        details: { recordSource: "current", status: current.reviewStatus, reviewerName: current.reviewerName ?? "未记录审核人",
          reviewedAt: current.reviewedAt.toISOString(), tags: tagSnapshots(current.reviewTags.map((tag) => tag.id)), note: current.reviewNote },
      } });
    }
    const reviewedAt = new Date();
    const video = await tx.videoStat.update({
      where: { id },
      data: {
        reviewStatus: patch.status,
        reviewerId: actor.sub,
        reviewerName: actor.displayName ?? actor.username,
        reviewedAt,
        ...(patch.note !== undefined ? { reviewNote: patch.note } : {}),
        reviewTags: {
          set: [...new Set(patch.tagIds)].map((id) => ({ id })),
        },
      },
      select: videoReviewSelect,
    });
    await tx.auditLog.create({ data: {
      actorId: actor.sub, actorUsername: actor.username,
      action: "video.review", targetType: "video", targetId: id,
      createdAt: reviewedAt,
      details: {
        status: patch.status, reviewerName: actor.displayName ?? actor.username,
        reviewedAt: reviewedAt.toISOString(), tagIds: [...new Set(patch.tagIds)],
        tags: tagSnapshots(patch.tagIds),
        note: video.reviewNote ?? null,
      },
    } });
    return video;
  });
}
