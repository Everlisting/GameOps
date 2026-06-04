/**
 * GET    /api/admin/csv-types/[id] — 详情
 * PATCH  /api/admin/csv-types/[id] — 更新(name/label/columns)
 * DELETE /api/admin/csv-types/[id] — 删除(被 Job.outputs[*].csvType 引用时拒绝)
 *
 * 鉴权:ADMIN
 *
 * 注意:改 columns 不会同步矫正 Job.outputs[].filterRoot;若旧 filter 引用了被删的列,
 * 入库时 evalFilter 会得到 cell="" 进而走默认逻辑(NOT_EMPTY=false 等),不会 throw。
 * 上线后可以在这里加一道告警。
 */
import type { Prisma } from "@prisma/client";

import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { conflict, notFound } from "@/lib/errors";
import { updateCsvTypeSchema } from "@/lib/validation/csv-type";

export const GET = route(async (_req, { params }) => {
  await requireRole("ADMIN");
  const id = params?.id ?? "";
  const item = await prisma.csvType.findUnique({
    where: { id },
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
  if (!item) throw notFound("csvType 不存在");
  return Response.json(item);
});

export const PATCH = route(async (req, { params }) => {
  await requireRole("ADMIN");
  const id = params?.id ?? "";
  const input = await parseJson(req, updateCsvTypeSchema);

  const existing = await prisma.csvType.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!existing) throw notFound("csvType 不存在");

  // 改 name 时:防重复
  if (input.name && input.name !== existing.name) {
    const dup = await prisma.csvType.findUnique({
      where: { name: input.name },
      select: { id: true },
    });
    if (dup) throw conflict("csvType 名称已被占用");
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.label !== undefined) data.label = input.label;
  if (input.description !== undefined) data.description = input.description ?? null;
  if (input.columns !== undefined) data.columns = input.columns as unknown as Prisma.InputJsonValue;

  await prisma.csvType.update({ where: { id }, data });
  return Response.json({ ok: true });
});

export const DELETE = route(async (_req, { params }) => {
  await requireRole("ADMIN");
  const id = params?.id ?? "";
  const existing = await prisma.csvType.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!existing) throw notFound("csvType 不存在");

  // 检查是否被任何 Job 的 outputs 引用
  // outputs 是 Json,直接 SQL 查 `outputs @> [{csvType: "<name>"}]`
  const referenced = await prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(
    `SELECT id, name FROM "CrawlerJob"
     WHERE outputs @> $1::jsonb
     LIMIT 5`,
    JSON.stringify([{ csvType: existing.name }]),
  );
  if (referenced.length > 0) {
    throw conflict(
      `还有 ${referenced.length} 个 Job 引用了 csvType「${existing.name}」(${referenced
        .map((r) => r.name)
        .join("、")}),先改掉那些 Job 再删。`,
    );
  }

  await prisma.csvType.delete({ where: { id } });
  return Response.json({ ok: true });
});
