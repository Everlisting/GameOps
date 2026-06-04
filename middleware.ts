/**
 * 边缘中间件:在请求到达页面前做鉴权与角色分流。
 *
 * 规则:
 *  - 未登录访问受保护区 → 跳登录页
 *  - 创作者访问运营端 → 拒绝(跳自己的首页)
 *  - 运营/管理员访问创作者端 → 跳运营首页
 *  - 已登录访问登录页 → 跳各自首页
 *
 * 注意:middleware 运行在 Edge,只能用 jose(不能用 argon2/prisma)。
 * 这里只做"会话是否有效 + 角色路由"判断;细粒度权限仍在 Route Handler 用 requireRole 兜底。
 */
import { NextResponse, type NextRequest } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/session";

const CREATOR_HOME = "/dashboard";
const OPERATOR_HOME = "/operator/dashboard";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  const isLoginPage = pathname === "/login";
  const isOperatorArea = pathname.startsWith("/operator");
  const isCreatorArea = pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  // 已登录还去登录页 → 回各自首页
  if (isLoginPage && session) {
    const dest = session.role === "CREATOR" ? CREATOR_HOME : OPERATOR_HOME;
    return NextResponse.redirect(new URL(dest, req.url));
  }

  // 受保护区未登录 → 跳登录
  if ((isOperatorArea || isCreatorArea) && !session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // 角色错配分流
  if (session) {
    if (isOperatorArea && session.role === "CREATOR") {
      return NextResponse.redirect(new URL(CREATOR_HOME, req.url));
    }
    if (isCreatorArea && session.role !== "CREATOR") {
      return NextResponse.redirect(new URL(OPERATOR_HOME, req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/dashboard/:path*", "/operator/:path*"],
};
