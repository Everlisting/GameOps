/**
 * POST /api/admin/operators/[id]/password — 管理员重置目标账号密码(仅 ADMIN)
 * 重置自己的密码请走「账户设置」,不在此处。
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { hashPassword } from "@/lib/auth";
import { operatorUserPasswordResetSchema } from "@/lib/validation/operator-user";

export const POST = route(async (req, { params }) => {
  const session = await requireRole("ADMIN");
  const id = params?.id ?? "";
  if (id === session.sub)
    throw forbidden("请到「账户设置」修改自己的密码");
  const { newPassword } = await parseJson(req, operatorUserPasswordResetSchema);

  const u = await prisma.user.findUnique({
    where: { id },
    select: { role: true },
  });
  if (!u) throw notFound("账号不存在");
  if (u.role === "CREATOR")
    throw badRequest("此接口不管理创作者账号");

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  return Response.json({ ok: true });
});
