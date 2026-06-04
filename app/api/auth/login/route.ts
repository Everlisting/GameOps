import { route, parseJson } from "@/lib/api";
import { unauthorized, forbidden } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { verifyPassword, signSession, setSessionCookie } from "@/lib/auth";
import { loginSchema } from "@/lib/validation/auth";

/** 登录接口。创作者与运营共用。返回角色,前端据此跳转。 */
export const POST = route(async (req) => {
  const { username, password } = await parseJson(req, loginSchema);

  const user = await prisma.user.findUnique({ where: { username } });
  // 统一报"用户名或密码错误",不泄露账号是否存在
  if (!user) throw unauthorized("用户名或密码错误");
  if (user.status === "pending")
    throw forbidden("账号待运营审核,审核通过后可登录");
  if (user.status !== "active") throw forbidden("账号已被停用");

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw unauthorized("用户名或密码错误");

  const token = await signSession({ sub: user.id, username: user.username, role: user.role });
  await setSessionCookie(token);

  return Response.json({ id: user.id, username: user.username, role: user.role });
});
