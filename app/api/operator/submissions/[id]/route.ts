/**
 * GET   /api/operator/submissions/[id] — 详情
 * PATCH /api/operator/submissions/[id] — 单条修改三子审核(任意一项或多项)+ 派生最终态
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { notFound } from "@/lib/errors";
import { submissionReviewSchema } from "@/lib/validation/submission";
import { deriveSubmissionStatus } from "@/lib/submission-review";

export const GET = route(async (_req, { params }) => {
  await requireRole("OPERATOR");
  const id = params?.id ?? "";

  const s = await prisma.submission.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      url: true,
      platform: true,
      externalId: true,
      status: true,
      titleStatus: true,
      titleNote: true,
      contentStatus: true,
      contentNote: true,
      yishanStatus: true,
      yishanNote: true,
      reviewNote: true,
      createdAt: true,
      updatedAt: true,
      creator: {
        select: {
          id: true,
          nickname: true,
          dyName: true,
          dyAccount: true,
          user: { select: { username: true, email: true } },
        },
      },
      activity: {
        select: { id: true, name: true, status: true, startAt: true, endAt: true },
      },
    },
  });
  if (!s) throw notFound("稿件不存在");
  return Response.json(s);
});

export const PATCH = route(async (req, { params }) => {
  await requireRole("OPERATOR");
  const id = params?.id ?? "";
  const patch = await parseJson(req, submissionReviewSchema);

  const updated = await prisma.$transaction(async (tx) => {
    const cur = await tx.submission.findUnique({
      where: { id },
      select: { titleStatus: true, contentStatus: true, yishanStatus: true },
    });
    if (!cur) throw notFound("稿件不存在");

    const next = {
      titleStatus: patch.title?.status ?? cur.titleStatus,
      contentStatus: patch.content?.status ?? cur.contentStatus,
      yishanStatus: patch.yishan?.status ?? cur.yishanStatus,
    };
    const status = deriveSubmissionStatus(
      next.titleStatus,
      next.contentStatus,
      next.yishanStatus,
    );

    return tx.submission.update({
      where: { id },
      data: {
        titleStatus: next.titleStatus,
        contentStatus: next.contentStatus,
        yishanStatus: next.yishanStatus,
        ...(patch.title?.note !== undefined ? { titleNote: patch.title.note } : {}),
        ...(patch.content?.note !== undefined
          ? { contentNote: patch.content.note }
          : {}),
        ...(patch.yishan?.note !== undefined
          ? { yishanNote: patch.yishan.note }
          : {}),
        status,
      },
      select: {
        id: true,
        status: true,
        titleStatus: true,
        titleNote: true,
        contentStatus: true,
        contentNote: true,
        yishanStatus: true,
        yishanNote: true,
      },
    });
  });

  return Response.json(updated);
});
