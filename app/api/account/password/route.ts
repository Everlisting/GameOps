/**
 * PATCH /api/account/password — 修改当前登录用户的密码。
 * 需要校验 currentPassword 后才允许写入新密码。
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { badRequest, notFound, unauthorized } from "@/lib/errors";
import { passwordChangeSchema } from "@/lib/validation/auth";

export const PATCH = route(async (req) => {
  const session = await requireAuth();
  const { currentPassword, newPassword } = await parseJson(
    req,
    passwordChangeSchema,
  );

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, passwordHash: true, status: true },
  });
  if (!user) throw notFound("账号不存在");
  if (user.status !== "active") throw badRequest("账号已被禁用");

  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) throw unauthorized("当前密码不正确");

  const newHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  return Response.json({ ok: true });
});
