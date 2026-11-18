import { z } from "zod";
import { Prisma } from "@prisma/client";
import { parseJson, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { requireRole } from "@/lib/rbac";
import { chinaDateString } from "@/lib/time";
import { ACTIVITY_TRANSACTION_TIMEOUT_MS, activityInput, activityValues, estimateActivity } from "@/lib/special-activities/db";
import { specialActivitySchema } from "@/lib/special-activities/rules";
import { lockReviewAssignments } from "@/lib/video-review-access";

const update = z.object({ revision: z.number().int().positive(), input: specialActivitySchema });
const confirm = z.object({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/) });

export const PATCH = route(async (req, { params }) => {
  const actor = await requireRole("OPERATOR");
  const id = params?.id;
  if (!id) throw notFound("专题活动不存在");
  const { input, revision } = await parseJson(req, update);
  await prisma.$transaction(async (tx) => {
    const changed = await tx.specialActivity.updateMany({
      where: { id, revision, settledAt: null }, data: { ...activityValues(input), revision: { increment: 1 } },
    });
    if (!changed.count) throw conflict("活动已变更或已结算，请刷新页面");
    await tx.auditLog.create({ data: {
      action: "specialActivity.update", targetType: "special_activity", targetId: id,
      actorId: actor.sub, actorUsername: actor.username, details: { revision: revision + 1 },
    } });
  });
  return Response.json({ id });
});

export const POST = route(async (req, { params }) => {
  const actor = await requireRole("OPERATOR");
  const id = params?.id;
  if (!id) throw notFound("专题活动不存在");
  const { fingerprint } = await parseJson(req, confirm);
  try {
    return await prisma.$transaction(async (tx) => {
      await lockReviewAssignments(tx);
      const activity = await tx.specialActivity.findUnique({ where: { id } });
      if (!activity) throw notFound("专题活动不存在");
      if (activity.settledAt) return Response.json({ id, settledAt: activity.settledAt });
      const input = activityInput(activity);
      const now = new Date();
      if (chinaDateString(now) <= input.endDate) throw badRequest("活动结束后才能确认结算");
      if (activity.cutoffAt && now < activity.cutoffAt) throw badRequest("数据截止时间未到，暂不能确认结算");
      const estimate = await estimateActivity(input, now, tx);
      if (!estimate.videos.length) throw badRequest("没有匹配稿件，暂不能确认结算");
      if (estimate.reviewCounts.pending > 0) {
        throw badRequest(`当前活动仍有 ${estimate.reviewCounts.pending} 条稿件待审核，请全部完成审核后再确认结算`);
      }
      if (!estimate.reviewCounts.approved) throw badRequest("没有审核通过的稿件，暂不能确认结算");
      if (estimate.missingData) throw badRequest("存在缺少截止指标的稿件，请补齐数据后再确认");
      if (estimate.fingerprint !== fingerprint) throw conflict("稿件、审核结果或规则已变更，请刷新预估后再确认");
      const saved = await tx.specialActivity.updateMany({
        where: { id, revision: activity.revision, settledAt: null },
        data: { settledAt: now, settlement: { version: 2, input, estimate } },
      });
      if (!saved.count) throw conflict("活动已变更，请刷新页面");
      await tx.auditLog.create({ data: {
        action: "specialActivity.settle", targetType: "special_activity", targetId: id,
        actorId: actor.sub, actorUsername: actor.username,
        details: { revision: activity.revision, totalCents: estimate.result.totalCents, videoCount: estimate.videos.length,
          reviewPolicy: estimate.reviewPolicy, reviewCounts: estimate.reviewCounts, dataAt: estimate.dataAt },
      } });
      return Response.json({ id, settledAt: now });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: ACTIVITY_TRANSACTION_TIMEOUT_MS });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw conflict("结算期间数据有更新，请刷新预估后重试");
    }
    throw error;
  }
});
