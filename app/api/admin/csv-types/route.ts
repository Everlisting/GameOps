/**
 * GET  /api/admin/csv-types — 列出所有 csvType(列表 + 引用数)
 * POST /api/admin/csv-types — 新建 csvType
 *
 * 鉴权:ADMIN
 */
import type { Prisma } from "@prisma/client";

import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { conflict } from "@/lib/errors";
import { createCsvTypeSchema } from "@/lib/validation/csv-type";

export const GET = route(async () => {
  await requireRole("ADMIN");
  const items = await prisma.csvType.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      label: true,
      description: true,
      columns: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { username: true } },
    },
  });
  return Response.json({ items });
});

export const POST = route(async (req) => {
  const session = await requireRole("ADMIN");
  const input = await parseJson(req, createCsvTypeSchema);

  const dup = await prisma.csvType.findUnique({
    where: { name: input.name },
    select: { id: true },
  });
  if (dup) throw conflict("csvType 名称已存在");

  const created = await prisma.csvType.create({
    data: {
      name: input.name,
      label: input.label,
      description: input.description ?? null,
      columns: input.columns as unknown as Prisma.InputJsonValue,
      createdById: session.sub,
    },
    select: { id: true, name: true, label: true, createdAt: true },
  });

  return Response.json(created, { status: 201 });
});
