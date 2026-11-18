import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { badRequest, conflict } from "@/lib/errors";
import { reviewTagSchema } from "@/lib/validation/review-tag";
import { recordAudit } from "@/lib/audit";

export const GET = route(async () => {
  await requireRole("REVIEWER");
  return Response.json(
    await prisma.reviewTag.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  );
});

export const POST = route(async (req) => {
  const actor = await requireRole("OPERATOR");
  const input = await parseJson(req, reviewTagSchema);
  const tag = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7264231)`;
    if (
      input.parentId &&
      !(await tx.reviewTag.findUnique({ where: { id: input.parentId } }))
    ) {
      throw badRequest("上级标签不存在，请刷新后重试");
    }
    if (
      await tx.reviewTag.findFirst({
        where: {
          parentId: input.parentId,
          name: { equals: input.name, mode: "insensitive" },
        },
      })
    ) {
      throw conflict("同一级下已存在同名标签");
    }
    return tx.reviewTag.create({ data: input });
  });
  await recordAudit({
    actorId: actor.sub,
    actorUsername: actor.username,
    action: "reviewTag.create",
    targetType: "review_tag",
    targetId: tag.id,
    details: input,
  });
  return Response.json(tag, { status: 201 });
});
