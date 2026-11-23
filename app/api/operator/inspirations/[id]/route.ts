/**
 * PATCH  /api/operator/inspirations/[id] — 局部更新，合并现有记录后校验完整资源
 * DELETE /api/operator/inspirations/[id] — 物理删除(无引用关系,安全直删)
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { notFound } from "@/lib/errors";
import { inspirationCreateSchema, inspirationUpdateSchema } from "@/lib/validation/inspiration";

export const PATCH = route(async (req, { params }) => {
  await requireRole("OPERATOR");
  const id = params?.id ?? "";
  const input = await parseJson(req, inspirationUpdateSchema);

  const existing = await prisma.inspiration.findUnique({
    where: { id },
  });
  if (!existing) throw notFound("灵感不存在");

  // 取定型后(若本次未传 type,沿用旧值)的 type 来决定 category 是否合法
  const nextType = input.type ?? existing.type;
  const validated = inspirationCreateSchema.parse({ ...existing, ...input,
    url: input.files !== undefined ? (input.files[0]?.url ?? input.url ?? null) : (input.url !== undefined ? input.url : existing.url),
    category: nextType === "MATERIAL" ? (input.category !== undefined ? input.category : existing.category) : null });
  const data: Record<string, unknown> = {};
  for (const k of [
    "type",
    "title",
    "summary",
    "content",
    "url",
    "files",
    "coverImage",
    "tags",
    "published",
  ] as const) {
    if (input[k] !== undefined) data[k] = input[k];
  }
  if (input.files !== undefined || input.url !== undefined) data.url = validated.files[0]?.url ?? validated.url;
  if (input.category !== undefined) {
    data.category = nextType === "MATERIAL" ? input.category : null;
  } else if (input.type !== undefined && input.type !== "MATERIAL") {
    // 切到非 MATERIAL 但没显式传 category,主动清空,避免脏数据
    data.category = null;
  }

  await prisma.inspiration.update({ where: { id }, data });
  return Response.json({ ok: true });
});

export const DELETE = route(async (_req, { params }) => {
  await requireRole("OPERATOR");
  const id = params?.id ?? "";
  const existing = await prisma.inspiration.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw notFound("灵感不存在");
  await prisma.inspiration.delete({ where: { id } });
  return Response.json({ ok: true });
});
