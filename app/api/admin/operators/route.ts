/**
 * GET  /api/admin/operators — 列出运营 / 管理员账户(仅 ADMIN)
 * POST /api/admin/operators — 创建运营 / 管理员账户(仅 ADMIN)
 */
import type { Prisma } from "@prisma/client";
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { conflict } from "@/lib/errors";
import { hashPassword } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/roles";
import {
  operatorUserCreateSchema,
  operatorUserListQuerySchema,
} from "@/lib/validation/operator-user";

export const GET = route(async (req) => {
  await requireRole("ADMIN");
  const url = new URL(req.url);
  const { role, status, q } = operatorUserListQuerySchema.parse(
    Object.fromEntries(url.searchParams),
  );

  const where: Prisma.UserWhereInput = {
    role: role ? role : { in: [...STAFF_ROLES] },
  };
  if (status) where.status = status;
  if (q) where.OR = [
    { username: { contains: q, mode: "insensitive" } },
    { displayName: { contains: q, mode: "insensitive" } },
  ];

  const items = await prisma.user.findMany({
    where,
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return Response.json({ items });
});

export const POST = route(async (req) => {
  await requireRole("ADMIN");
  const { username, displayName, password, role } = await parseJson(
    req,
    operatorUserCreateSchema,
  );

  const taken = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (taken) throw conflict("账号名称已被占用");

  const created = await prisma.user.create({
    data: {
      username,
      displayName,
      passwordHash: await hashPassword(password),
      role,
      status: "active", // 管理员手工创建,无需再走 pending
    },
    select: { id: true, username: true, displayName: true, role: true, status: true },
  });
  return Response.json(created, { status: 201 });
});
