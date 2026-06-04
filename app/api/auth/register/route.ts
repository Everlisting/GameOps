import { route, parseJson } from "@/lib/api";
import { conflict } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { registerSchema } from "@/lib/validation/auth";

/**
 * 注册接口。仅开放创作者自助注册;运营/管理员账号由管理员后台创建。
 * 注册后账号 status=pending,需运营审核通过后才能登录(不签发 session)。
 */
export const POST = route(async (req) => {
  const { username, password, nickname, email } = await parseJson(req, registerSchema);

  const [usernameTaken, emailTaken] = await Promise.all([
    prisma.user.findUnique({ where: { username }, select: { id: true } }),
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ]);
  if (usernameTaken) throw conflict("用户名已被占用");
  if (emailTaken) throw conflict("邮箱已被占用");

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      role: "CREATOR",
      // status 走 schema 默认值 "pending"
      creator: { create: { nickname } },
    },
    select: { id: true, username: true, status: true },
  });

  return Response.json(
    {
      id: user.id,
      username: user.username,
      status: user.status,
      message: "注册成功,账号已提交运营审核,请耐心等待。",
    },
    { status: 201 },
  );
});
