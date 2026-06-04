/**
 * GET    /api/operator/activities/[id] — 活动详情(运营视角:含 rewardRules、计数)
 * PATCH  /api/operator/activities/[id] — 编辑活动(部分更新,支持 rewardRules 替换)
 * DELETE /api/operator/activities/[id] — 删除活动(仅 DRAFT 允许)
 *
 * 编辑策略:
 *   - DRAFT   :所有字段可改;publishAt 仅 DRAFT 可写。
 *   - ONGOING :基础信息 / rewardRules 仍可改(客户端做二级确认);publishAt 不允许写。
 *   - ENDED   :拒绝所有内容编辑(基础信息 + rewardRules),返回 400。
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { badRequest, notFound } from "@/lib/errors";
import { activityUpdateSchema } from "@/lib/validation/activity";

export const GET = route(async (_req, { params }) => {
  await requireRole("OPERATOR");
  const id = params?.id ?? "";

  const a = await prisma.activity.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      coverImage: true,
      status: true,
      startAt: true,
      endAt: true,
      publishAt: true,
      rewardRules: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { submissions: true, enrollments: true } },
    },
  });
  if (!a) throw notFound("活动不存在");
  return Response.json(a);
});

export const PATCH = route(async (req, { params }) => {
  await requireRole("OPERATOR");
  const id = params?.id ?? "";
  const input = await parseJson(req, activityUpdateSchema);

  const existing = await prisma.activity.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) throw notFound("活动不存在");

  const touchesContent =
    input.name !== undefined ||
    input.description !== undefined ||
    input.coverImage !== undefined ||
    input.startAt !== undefined ||
    input.endAt !== undefined ||
    input.rewardRules !== undefined;

  if (existing.status === "ENDED" && touchesContent) {
    throw badRequest("活动已结束,不能再修改基础信息或激励规则");
  }
  if (existing.status !== "DRAFT" && input.publishAt !== undefined) {
    throw badRequest("仅草稿活动可设置定时发布时间");
  }

  await prisma.activity.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.coverImage !== undefined
        ? { coverImage: input.coverImage }
        : {}),
      ...(input.startAt ? { startAt: new Date(input.startAt) } : {}),
      ...(input.endAt ? { endAt: new Date(input.endAt) } : {}),
      ...(input.rewardRules !== undefined
        ? { rewardRules: input.rewardRules }
        : {}),
      ...(input.publishAt !== undefined
        ? { publishAt: input.publishAt === null ? null : new Date(input.publishAt) }
        : {}),
    },
  });

  return Response.json({ ok: true });
});

export const DELETE = route(async (_req, { params }) => {
  await requireRole("OPERATOR");
  const id = params?.id ?? "";

  const a = await prisma.activity.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!a) throw notFound("活动不存在");
  if (a.status !== "DRAFT")
    throw badRequest("仅草稿状态的活动可以删除,请先改为草稿或归档为已结束");

  await prisma.activity.delete({ where: { id } });
  return Response.json({ ok: true });
});
