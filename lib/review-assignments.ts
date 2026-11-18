import { Prisma, type SubmissionPeriod } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { hasRole } from "@/lib/roles";
import { chinaDateTimeRange } from "@/lib/data-period";
import type { SessionPayload } from "@/lib/session";
import { getSubmissionPeriod } from "@/lib/submission-periods";
import { lockReviewAssignments, type ReviewActor } from "@/lib/video-review-access";
import { allocateReviewVideos, combinedAllocationCounts, type AllocationVideo } from "@/lib/review-allocation";
import { reviewAssignmentGroups, reviewAssignmentResultSchema, type ReviewAssignmentInput } from "@/lib/validation/review-assignment";

function periodVideoScope(period: SubmissionPeriod) {
  const range = chinaDateTimeRange(period.startDate.toISOString().slice(0, 10), period.endDate.toISOString().slice(0, 10));
  return Prisma.sql`v."hidden" = false AND v."publishedAt" >= ${range.gte!} AND v."publishedAt" < ${range.lt!}`;
}

export type AssignmentReviewer = {
  id: string; username: string; displayName: string; active: boolean;
  assigned: number; reviewed: number; pending: number;
};
export type PeriodAssignmentOverview = {
  eligible: number; assigned: number; otherPeriodAssigned: number; reviewers: AssignmentReviewer[];
};

export async function periodAssignmentOverview(id: string, actor: ReviewActor): Promise<PeriodAssignmentOverview> {
  if (!hasRole(actor.role, "OPERATOR")) throw forbidden();
  const period = await getSubmissionPeriod(id, actor);
  const scope = periodVideoScope(period);
  const [[counts], reviewers] = await Promise.all([
    prisma.$queryRaw<{ eligible: number; assigned: number; otherPeriodAssigned: number }[]>(Prisma.sql`
      SELECT COUNT(*) FILTER (WHERE v."reviewStatus" = 'PENDING' AND a."videoId" IS NULL)::int AS eligible,
        COUNT(*) FILTER (WHERE a."periodId" = ${id})::int AS assigned,
        COUNT(*) FILTER (WHERE a."periodId" <> ${id})::int AS "otherPeriodAssigned"
      FROM "VideoStat" v LEFT JOIN "VideoReviewAssignment" a ON a."videoId" = v."id" WHERE ${scope}
    `),
    prisma.$queryRaw<AssignmentReviewer[]>(Prisma.sql`
      SELECT u."id", u."username", COALESCE(u."displayName", u."username") AS "displayName",
        (u."role" = 'REVIEWER' AND u."status" = 'active') AS active,
        COUNT(v."id")::int AS assigned,
        COUNT(v."id") FILTER (WHERE v."reviewStatus" <> 'PENDING')::int AS reviewed,
        COUNT(v."id") FILTER (WHERE v."reviewStatus" = 'PENDING')::int AS pending
      FROM "User" u LEFT JOIN "VideoReviewAssignment" a ON a."reviewerId" = u."id" AND a."periodId" = ${id}
      LEFT JOIN "VideoStat" v ON v."id" = a."videoId" AND ${scope}
      WHERE (u."role" = 'REVIEWER' AND u."status" = 'active') OR a."videoId" IS NOT NULL
      GROUP BY u."id" ORDER BY active DESC, COALESCE(u."displayName", u."username"), u."username"
    `),
  ]);
  return { ...counts, reviewers };
}

export async function assignPeriodReviews(id: string, input: ReviewAssignmentInput, actor: SessionPayload) {
  if (!hasRole(actor.role, "OPERATOR")) throw forbidden();
  return prisma.$transaction(async (tx) => {
    await lockReviewAssignments(tx);
    const [period] = await tx.$queryRaw<SubmissionPeriod[]>`SELECT * FROM "SubmissionPeriod" WHERE "id" = ${id}`;
    if (!period) throw notFound("稿件统计不存在");
    const groups = reviewAssignmentGroups(input);
    const configuration = "groups" in input
      ? { expectedEligibleCount: input.expectedEligibleCount, groups: groups.map((group) => ({ ...group, recipients: [...group.recipients].sort((a, b) => a.reviewerId.localeCompare(b.reviewerId)) })) }
      : { mode: input.mode, expectedEligibleCount: input.expectedEligibleCount, recipients: [...input.recipients].sort((a, b) => a.reviewerId.localeCompare(b.reviewerId)), ...(input.totalCount !== undefined ? { totalCount: input.totalCount } : {}) };
    const requestHash = createHash("sha256").update(JSON.stringify(configuration)).digest("hex");
    const previous = await tx.auditLog.findFirst({ where: {
      action: "video.assignment", targetId: id, actorId: actor.sub,
      details: { path: ["requestId"], equals: input.requestId },
    }, select: { details: true } });
    if (previous) {
      const details = previous.details as { requestHash?: unknown; result?: unknown } | null;
      if (details?.requestHash !== requestHash) throw conflict("分配配置已变更，请重新预览后确认。");
      return reviewAssignmentResultSchema.parse(details.result);
    }
    const ids = [...new Set(groups.flatMap((group) => group.recipients.map((row) => row.reviewerId)))];
    const reviewers = await tx.$queryRaw<{ id: string; username: string; displayName: string | null }[]>(Prisma.sql`
      SELECT "id", "username", "displayName" FROM "User"
      WHERE "id" IN (${Prisma.join(ids)}) AND "role" = 'REVIEWER' AND "status" = 'active'
      FOR SHARE
    `);
    if (reviewers.length !== ids.length || new Set(ids).size !== ids.length)
      throw badRequest("部分审核员已停用、角色已变更或重复选择，请刷新后重试。");
    const videos = await tx.$queryRaw<AllocationVideo[]>(Prisma.sql`
      SELECT v."id", v."platform", v."creatorUid" FROM "VideoStat" v
      LEFT JOIN "VideoReviewAssignment" a ON a."videoId" = v."id"
      WHERE ${periodVideoScope(period)} AND v."reviewStatus" = 'PENDING' AND a."videoId" IS NULL
      ORDER BY v."id" FOR UPDATE OF v
    `);
    if (videos.length !== input.expectedEligibleCount)
      throw conflict(`可分配稿件数量已变化（预览 ${input.expectedEligibleCount} 条，当前 ${videos.length} 条），请重新预览后确认。`);
    if (!videos.length) throw badRequest("当前周期没有待审核且未分配的有效稿件。");
    const targets = combinedAllocationCounts(groups, videos.length);
    const total = targets.reduce((sum, row) => sum + row.count, 0);
    if (!total || targets.some((row) => row.count < 0 || !Number.isSafeInteger(row.count)) || total > videos.length)
      throw badRequest(`分配数量需大于0且不超过当前可分配的 ${videos.length} 条稿件。`);
    const plan = allocateReviewVideos(videos, targets);
    const assignedAt = new Date();
    for (let offset = 0; offset < plan.length; offset += 1000) {
      const values = plan.slice(offset, offset + 1000).map((row) => Prisma.sql`(${row.videoId}, ${id}, ${row.reviewerId}, ${actor.sub}, ${assignedAt})`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "VideoReviewAssignment" ("videoId", "periodId", "reviewerId", "assignedById", "assignedAt")
        VALUES ${Prisma.join(values)}
      `);
    }
    const allocation = targets.map((target) => ({ ...target, username: reviewers.find((row) => row.id === target.reviewerId)!.username }));
    const result = { assigned: plan.length, remaining: videos.length - plan.length, allocation };
    await tx.auditLog.create({ data: {
      actorId: actor.sub, actorUsername: actor.username, action: "video.assignment", targetType: "submission_period", targetId: id,
      details: { requestId: input.requestId, requestHash, mode: groups.length > 1 ? "COMBINED" : groups[0].mode, groups, count: plan.length, allocation, result },
    } });
    return result;
  }, { timeout: 60000, maxWait: 10000 });
}
