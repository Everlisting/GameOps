/**
 * PATCH /api/account/email — 修改当前登录用户的邮箱。
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { conflict } from "@/lib/errors";
import { emailChangeSchema } from "@/lib/validation/auth";

export const PATCH = route(async (req) => {
  const session = await requireAuth();
  const { email } = await parseJson(req, emailChangeSchema);

  const taken = await prisma.user.findFirst({
    where: { email, NOT: { id: session.sub } },
    select: { id: true },
  });
  if (taken) throw conflict("邮箱已被占用");

  const updated = await prisma.user.update({
    where: { id: session.sub },
    data: { email },
    select: { id: true, email: true },
  });
  return Response.json(updated);
});
