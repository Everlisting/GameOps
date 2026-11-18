import { randomUUID } from "node:crypto";
import { Prisma, type SubmissionPeriod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { ensureReviewActor, lockReviewAssignments, type ReviewActor } from "@/lib/video-review-access";
import type { SessionPayload } from "@/lib/session";
import type { SubmissionPeriodInput } from "@/lib/validation/submission-period";

export type SubmissionPeriodSearch = { q?: string; status?: string };

export function periodSearch(search: SubmissionPeriodSearch = {}) {
  return {
    q: typeof search.q === "string" ? search.q.trim().slice(0, 120) : "",
    status: search.status === "FROZEN" || search.status === "REVIEWING" ? search.status : "",
  };
}

export function loadSubmissionPeriods(search: SubmissionPeriodSearch, actor: ReviewActor) {
  ensureReviewActor(actor);
  const { q, status } = periodSearch(search);
  const name = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  return prisma.$queryRaw<SubmissionPeriod[]>(Prisma.sql`
    SELECT p.* FROM "SubmissionPeriod" p
    WHERE ${q ? Prisma.sql`"title" ILIKE ${name}` : Prisma.sql`TRUE`}
      AND ${status ? Prisma.sql`"status" = ${status}::"SubmissionPeriodStatus"` : Prisma.sql`TRUE`}
      AND ${actor.role === "REVIEWER" ? Prisma.sql`EXISTS (SELECT 1 FROM "VideoReviewAssignment" a WHERE a."periodId" = p."id" AND a."reviewerId" = ${actor.sub})` : Prisma.sql`TRUE`}
    ORDER BY "startDate" DESC, "createdAt" DESC, "id" DESC
  `);
}

export async function getSubmissionPeriod(id: string, actor: ReviewActor) {
  ensureReviewActor(actor);
  const [row] = await prisma.$queryRaw<SubmissionPeriod[]>(Prisma.sql`
    SELECT p.* FROM "SubmissionPeriod" p WHERE p."id" = ${id}
    AND ${actor.role === "REVIEWER" ? Prisma.sql`EXISTS (SELECT 1 FROM "VideoReviewAssignment" a WHERE a."periodId" = p."id" AND a."reviewerId" = ${actor.sub})` : Prisma.sql`TRUE`}
  `);
  if (!row) throw notFound("稿件统计不存在");
  return row;
}

export async function saveSubmissionPeriod(input: SubmissionPeriodInput, actor: SessionPayload, id?: string) {
  const periodId = id ?? randomUUID();
  const start = new Date(`${input.startDate}T00:00:00Z`);
  const end = new Date(`${input.endDate}T00:00:00Z`);
  return prisma.$transaction(async (tx) => {
    await lockReviewAssignments(tx);
    if (id) {
      const [existing] = await tx.$queryRaw<SubmissionPeriod[]>`SELECT * FROM "SubmissionPeriod" WHERE "id" = ${id}`;
      if (!existing) throw notFound("稿件统计不存在，请返回列表重试");
      if (existing.startDate.getTime() !== start.getTime() || existing.endDate.getTime() !== end.getTime()) {
        const assigned = await tx.$queryRaw<{ videoId: string }[]>`SELECT "videoId" FROM "VideoReviewAssignment" WHERE "periodId" = ${id} LIMIT 1`;
        if (assigned.length) throw badRequest("该周期已有分配稿件，不能修改统计起止日期；仍可修改名称和状态。");
      }
      const count = await tx.$executeRaw`
        UPDATE "SubmissionPeriod" SET "title" = ${input.title}, "startDate" = ${start}::date,
          "endDate" = ${end}::date, "status" = ${input.status}::"SubmissionPeriodStatus",
          "updatedAt" = ${new Date()} WHERE "id" = ${id}
      `;
      if (!count) throw notFound("稿件统计不存在，请返回列表重试");
    } else {
      await tx.$executeRaw`
        INSERT INTO "SubmissionPeriod" ("id", "title", "startDate", "endDate", "status", "updatedAt")
        VALUES (${periodId}, ${input.title}, ${start}::date, ${end}::date, ${input.status}::"SubmissionPeriodStatus", ${new Date()})
      `;
    }
    await tx.auditLog.create({ data: {
      actorId: actor.sub, actorUsername: actor.username,
      action: id ? "submissionPeriod.update" : "submissionPeriod.create",
      targetType: "submission_period", targetId: periodId, details: input,
    } });
    return { id: periodId };
  });
}
