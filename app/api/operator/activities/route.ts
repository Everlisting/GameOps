/**
 * GET  /api/operator/activities — 运营端活动列表(可按 status / q 过滤)
 * POST /api/operator/activities — 新建活动(默认 DRAFT)
 */
import type { Prisma } from "@prisma/client";
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import {
  activityCreateSchema,
  operatorActivityListQuerySchema,
} from "@/lib/validation/activity";

export const GET = route(async (req) => {
  await requireRole("OPERATOR");
  const url = new URL(req.url);
  const { status, q } = operatorActivityListQuerySchema.parse(
    Object.fromEntries(url.searchParams),
  );

  const where: Prisma.ActivityWhereInput = {};
  if (status) where.status = status;
  if (q) where.name = { contains: q, mode: "insensitive" };

  const items = await prisma.activity.findMany({
    where,
    orderBy: [{ status: "asc" }, { startAt: "desc" }],
    select: {
      id: true,
      name: true,
      description: true,
      coverImage: true,
      status: true,
      startAt: true,
      endAt: true,
      createdAt: true,
      _count: { select: { submissions: true, enrollments: true } },
    },
  });

  return Response.json({ items });
});

export const POST = route(async (req) => {
  await requireRole("OPERATOR");
  const input = await parseJson(req, activityCreateSchema);

  const created = await prisma.activity.create({
    data: {
      name: input.name,
      description: input.description,
      coverImage: input.coverImage,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      rewardRules: input.rewardRules,
      // status 走默认 DRAFT
    },
    select: { id: true },
  });

  return Response.json({ id: created.id }, { status: 201 });
});
