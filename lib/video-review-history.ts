import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { forbidden, notFound } from "@/lib/errors";
import { hasRole } from "@/lib/roles";
import type { ReviewActor } from "@/lib/video-review-access";
import { flattenReviewTags } from "@/lib/review-tags";
import type { VideoReviewHistory } from "@/lib/validation/video-review-history";

const detailsSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  reviewerName: z.string().optional(), reviewedAt: z.string().datetime().optional(),
  tagIds: z.array(z.string()).optional(),
  tags: z.array(z.object({ id: z.string(), path: z.string() })).optional(),
  note: z.string().nullable().optional(),
  recordSource: z.literal("current").optional(),
});

export function videoReviewAuditWhere(id: string): Prisma.AuditLogWhereInput {
  return { targetType: "video", OR: [
    { action: "video.review", targetId: id },
    { action: "video.review.batch", details: { path: ["ids"], array_contains: [id] } },
  ] };
}

/** 不套用管理员审计页的60天窗口；每次审核均属于稿件自身的历史。 */
export async function loadVideoReviewHistory(id: string, requestedPage: number, actor: ReviewActor): Promise<VideoReviewHistory> {
  if (!hasRole(actor.role, "OPERATOR")) throw forbidden();
  const video = await prisma.videoStat.findUnique({ where: { id }, select: {
    reviewStatus: true, reviewerName: true, reviewedAt: true, reviewNote: true, reviewTags: { select: { id: true } },
  } });
  if (!video) throw notFound("视频不存在");
  const where = videoReviewAuditWhere(id);
  const count = await prisma.auditLog.count({ where });
  const total = count || (video.reviewedAt ? 1 : 0);
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const page = Math.min(totalPages, Math.max(1, requestedPage));
  const logs = count ? await prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20,
    select: { id: true, actorUsername: true, action: true, details: true, createdAt: true },
  }) : [];
  const needsCurrentTags = !count || logs.some((log) => {
    const parsed = detailsSchema.safeParse(log.details);
    return parsed.success && !parsed.data.tags && !!parsed.data.tagIds?.length;
  });
  const currentTags = needsCurrentTags ? flattenReviewTags(await prisma.reviewTag.findMany()) : [];
  const paths = (ids: string[]) => ids.map((tagId) => ({ id: tagId, path: currentTags.find((tag) => tag.id === tagId)?.path ?? `已删除标签（${tagId}）` }));
  const rows: VideoReviewHistory["rows"] = logs.map((log) => {
    const parsed = detailsSchema.safeParse(log.details);
    const details = parsed.success ? parsed.data : {};
    return {
      id: log.id, reviewerName: details.reviewerName ?? log.actorUsername, actorUsername: details.recordSource ? null : log.actorUsername,
      reviewedAt: details.reviewedAt ?? log.createdAt.toISOString(), status: details.status ?? null,
      tags: details.tags ?? paths(details.tagIds ?? []), tagSource: details.recordSource ? "retained" : details.tags ? "snapshot" : details.tagIds ? "current" : "missing",
      source: details.recordSource ?? (log.action === "video.review.batch" ? "batch" : "single"), note: details.note ?? null,
    };
  });
  if (!count && video.reviewedAt) rows.push({
    id: `current:${id}`, reviewerName: video.reviewerName ?? "未记录审核人", actorUsername: null,
    reviewedAt: video.reviewedAt.toISOString(), status: video.reviewStatus, tags: paths(video.reviewTags.map((tag) => tag.id)),
    tagSource: "current", source: "current", note: video.reviewNote,
  });
  return { rows, total, page, totalPages };
}
