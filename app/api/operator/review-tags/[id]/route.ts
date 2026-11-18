import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { reviewTagSchema } from "@/lib/validation/review-tag";
import { tagDescendants } from "@/lib/review-tags";
import { recordAudit } from "@/lib/audit";

export const PATCH = route(async (req, { params }) => {
  const actor = await requireRole("OPERATOR");
  const id = params?.id ?? "";
  const input = await parseJson(req, reviewTagSchema);
  const tag = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7264231)`;
    const tags = await tx.reviewTag.findMany();
    if (!tags.some((tag) => tag.id === id)) throw notFound("标签不存在");
    if (input.parentId) {
      if (!tags.some((tag) => tag.id === input.parentId))
        throw badRequest("上级标签不存在");
      if (tagDescendants(tags, id).has(input.parentId))
        throw badRequest("不能将标签移到自身或其子级下");
    }
    if (
      tags.some(
        (tag) =>
          tag.id !== id &&
          tag.parentId === input.parentId &&
          tag.name.toLocaleLowerCase() === input.name.toLocaleLowerCase(),
      )
    ) {
      throw conflict("同一级下已存在同名标签");
    }
    return tx.reviewTag.update({ where: { id }, data: input });
  });
  await recordAudit({
    actorId: actor.sub,
    actorUsername: actor.username,
    action: "reviewTag.update",
    targetType: "review_tag",
    targetId: id,
    details: input,
  });
  return Response.json(tag);
});

export const DELETE = route(async (_req, { params }) => {
  const actor = await requireRole("OPERATOR");
  const id = params?.id ?? "";
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7264231)`;
    const tag = await tx.reviewTag.findUnique({
      where: { id },
      include: { _count: { select: { children: true, submissions: true, videos: true } } },
    });
    if (!tag) throw notFound("标签不存在");
    if (tag._count.children) throw conflict("请先移动或删除子标签");
    if (tag._count.submissions || tag._count.videos)
      throw conflict("标签已被稿件使用，请改为停用以保留历史记录");
    await tx.reviewTag.delete({ where: { id } });
  });
  await recordAudit({
    actorId: actor.sub,
    actorUsername: actor.username,
    action: "reviewTag.delete",
    targetType: "review_tag",
    targetId: id,
  });
  return Response.json({ ok: true });
});
