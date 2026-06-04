/**
 * GET  /api/submissions — 当前创作者的投稿列表(可按 status / activityId 过滤)
 * POST /api/submissions — 创作者新建投稿(可挂活动,挂活动时需活动处于 ONGOING)
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/creator";
import { badRequest, conflict, notFound } from "@/lib/errors";
import {
  submissionCreateSchema,
  submissionListQuerySchema,
} from "@/lib/validation/submission";
import { resolveAndParseExternalId } from "@/lib/submission-review";

export const GET = route(async (req) => {
  const { creator } = await requireCreator();
  const url = new URL(req.url);
  const { status, activityId } = submissionListQuerySchema.parse(
    Object.fromEntries(url.searchParams),
  );

  const items = await prisma.submission.findMany({
    where: {
      creatorId: creator.id,
      ...(status ? { status } : {}),
      ...(activityId ? { activityId } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      url: true,
      platform: true,
      status: true,
      reviewNote: true,
      createdAt: true,
      activity: { select: { id: true, name: true } },
    },
  });

  return Response.json({ items });
});

export const POST = route(async (req) => {
  const { creator } = await requireCreator();
  const input = await parseJson(req, submissionCreateSchema);

  if (input.activityId) {
    const activity = await prisma.activity.findUnique({
      where: { id: input.activityId },
      select: { status: true },
    });
    if (!activity) throw notFound("活动不存在");
    if (activity.status !== "ONGOING")
      throw badRequest("该活动当前不开放投稿");

    const enrolled = await prisma.activityEnrollment.findUnique({
      where: {
        creatorId_activityId: {
          creatorId: creator.id,
          activityId: input.activityId,
        },
      },
      select: { id: true },
    });
    if (!enrolled) throw badRequest("请先报名该活动后再投稿");
  }

  // 长链直接正则,短链跟随重定向再解析(网络异常返回 null,允许稿件先入库)
  const externalId = await resolveAndParseExternalId(input.platform, input.url);

  // 同平台同稿件 ID 防重提交
  if (externalId) {
    const dup = await prisma.submission.findUnique({
      where: { platform_externalId: { platform: input.platform, externalId } },
      select: { id: true, creatorId: true },
    });
    if (dup) {
      throw conflict(
        dup.creatorId === creator.id
          ? "该稿件链接已投过"
          : "该稿件链接已被其他创作者提交",
      );
    }
  }

  const submission = await prisma.submission.create({
    data: {
      creatorId: creator.id,
      activityId: input.activityId ?? null,
      title: input.title,
      url: input.url,
      platform: input.platform,
      externalId,
    },
    select: {
      id: true,
      title: true,
      url: true,
      platform: true,
      status: true,
      createdAt: true,
      activity: { select: { id: true, name: true } },
    },
  });

  return Response.json(submission, { status: 201 });
});
