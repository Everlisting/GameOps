/** 后台账户自助修改显示用户名;登录账号名称不允许更新。 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { operatorProfileUpdateSchema } from "@/lib/validation/operator-user";

export const PATCH = route(async (req) => {
  const session = await requireRole("REVIEWER");
  const { displayName } = await parseJson(req, operatorProfileUpdateSchema);
  const updated = await prisma.user.update({
    where: { id: session.sub },
    data: { displayName },
    select: { id: true, username: true, displayName: true },
  });
  return Response.json(updated);
});
