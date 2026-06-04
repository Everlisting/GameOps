/**
 * GET /api/operator/creators — 创作者列表
 * 过滤:status (user.status) / q (昵称/用户名/邮箱)
 * 分页:page / pageSize
 */
import type { Prisma } from "@prisma/client";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { operatorCreatorListQuerySchema } from "@/lib/validation/creator";

export const GET = route(async (req) => {
  await requireRole("OPERATOR");
  const url = new URL(req.url);
  const { status, q, page, pageSize } = operatorCreatorListQuerySchema.parse(
    Object.fromEntries(url.searchParams),
  );

  const where: Prisma.CreatorWhereInput = {};
  const userWhere: Prisma.UserWhereInput = {};
  if (status) userWhere.status = status;
  if (q) {
    where.OR = [
      { nickname: { contains: q, mode: "insensitive" } },
      { user: { username: { contains: q, mode: "insensitive" } } },
      { user: { email: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (Object.keys(userWhere).length > 0) where.user = userWhere;

  const [total, items] = await Promise.all([
    prisma.creator.count({ where }),
    prisma.creator.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        tier: true,
        dyName: true,
        dyAccount: true,
        createdAt: true,
        user: {
          select: { id: true, username: true, email: true, status: true },
        },
        _count: { select: { submissions: true, enrollments: true } },
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
