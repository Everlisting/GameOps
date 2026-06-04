/**
 * 创作者会话助手:从 session 获取对应的 Creator 记录。
 * 适用于创作者端 Route Handler 与 Server Component。
 */
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { notFound } from "@/lib/errors";

/** 要求当前会话是创作者,并返回其 Creator 记录(含 user 基础字段)。*/
export async function requireCreator() {
  const session = await requireRole("CREATOR");
  const creator = await prisma.creator.findUnique({
    where: { userId: session.sub },
  });
  // 数据库异常缺失:CREATOR 注册时一定会建 Creator,理论上不会触发
  if (!creator) throw notFound("创作者档案不存在,请联系管理员");
  return { session, creator };
}
