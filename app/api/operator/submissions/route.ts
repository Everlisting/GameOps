/**
 * GET /api/operator/submissions — 运营端稿件列表
 * 过滤:status / platform / activityId / creatorId / q(稿件标题或创作者昵称)
 * 分页:page / pageSize(默认 1 / 50)
 */
import type { Prisma } from "@prisma/client";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { operatorSubmissionListQuerySchema } from "@/lib/validation/submission";

export const GET = route(async (req) => {
  await requireRole("OPERATOR");
  const url = new URL(req.url);
  const { status, q, platform, activityId, creatorId, page, pageSize } =
    operatorSubmissionListQuerySchema.parse(
      Object.fromEntries(url.searchParams),
    );

  const where: Prisma.SubmissionWhereInput = {};
  if (status) where.status = status;
  if (platform) where.platform = platform;
  if (activityId) where.activityId = activityId;
  if (creatorId) where.creatorId = creatorId;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { creator: { nickname: { contains: q, mode: "insensitive" } } },
      { activity: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.submission.count({ where }),
    prisma.submission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        url: true,
        platform: true,
        externalId: true,
        status: true,
        titleStatus: true,
        contentStatus: true,
        yishanStatus: true,
        createdAt: true,
        updatedAt: true,
        creator: { select: { id: true, nickname: true } },
        activity: { select: { id: true, name: true, status: true } },
      },
    }),
  ]);

  return Response.json({
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});
