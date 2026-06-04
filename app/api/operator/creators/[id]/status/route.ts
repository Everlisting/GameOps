/**
 * PATCH /api/operator/creators/[id]/status — 切换创作者账户状态
 * 允许 status:active(启用) / disabled(停用)。
 * 注册产生的 pending 通过 active 通过审核、通过 disabled 拒绝。
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { notFound } from "@/lib/errors";
import { operatorCreatorStatusSchema } from "@/lib/validation/creator";

export const PATCH = route(async (req, { params }) => {
  await requireRole("OPERATOR");
  const id = params?.id ?? "";
  const { status } = await parseJson(req, operatorCreatorStatusSchema);

  const c = await prisma.creator.findUnique({
    where: { id },
    select: { userId: true, user: { select: { status: true } } },
  });
  if (!c) throw notFound("创作者不存在");
  if (c.user.status === status) return Response.json({ ok: true });

  await prisma.user.update({
    where: { id: c.userId },
    data: { status },
  });

  return Response.json({ ok: true });
});
