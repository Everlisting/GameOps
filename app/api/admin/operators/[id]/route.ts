/**
 * PATCH  /api/admin/operators/[id] — 改角色 / 状态(仅 ADMIN)
 * DELETE /api/admin/operators/[id] — 删除账户(仅 ADMIN)
 *
 * 自伤防护:不能改自己的角色 / 状态,不能删自己。
 * 范围限定:只能操作 OPERATOR / ADMIN 账户,创作者账户由「创作者管理」处理。
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { operatorUserUpdateSchema } from "@/lib/validation/operator-user";

async function findOperatorUser(id: string) {
  const u = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, role: true, status: true },
  });
  if (!u) throw notFound("账号不存在");
  if (u.role === "CREATOR")
    throw badRequest("此接口不管理创作者账号,请前往创作者管理");
  return u;
}

export const PATCH = route(async (req, { params }) => {
  const session = await requireRole("ADMIN");
  const id = params?.id ?? "";
  if (id === session.sub) throw forbidden("无法修改自己的角色或状态");
  const patch = await parseJson(req, operatorUserUpdateSchema);

  await findOperatorUser(id);

  await prisma.user.update({
    where: { id },
    data: {
      ...(patch.role ? { role: patch.role } : {}),
      ...(patch.status ? { status: patch.status } : {}),
    },
  });
  return Response.json({ ok: true });
});

export const DELETE = route(async (_req, { params }) => {
  const session = await requireRole("ADMIN");
  const id = params?.id ?? "";
  if (id === session.sub) throw forbidden("无法删除自己");

  await findOperatorUser(id);

  await prisma.user.delete({ where: { id } });
  return Response.json({ ok: true });
});
