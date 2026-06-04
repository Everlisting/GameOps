/**
 * GET   /api/operator/creators/[id] — 创作者详情(基本信息 / 账户 / 报名 / 投稿统计)
 * PATCH /api/operator/creators/[id] — 编辑创作者档案(nickname / tier / 平台账号)
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { notFound } from "@/lib/errors";
import { operatorCreatorUpdateSchema } from "@/lib/validation/creator";

export const GET = route(async (_req, { params }) => {
  await requireRole("OPERATOR");
  const id = params?.id ?? "";

  const c = await prisma.creator.findUnique({
    where: { id },
    select: {
      id: true,
      nickname: true,
      avatarUrl: true,
      tier: true,
      groupNo: true,
      ysId: true,
      dyUid: true,
      dyName: true,
      dyAccount: true,
      dyUrl: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          status: true,
          createdAt: true,
        },
      },
      _count: {
        select: { submissions: true, enrollments: true },
      },
    },
  });
  if (!c) throw notFound("创作者不存在");

  // 子状态分布
  const subStats = await prisma.submission.groupBy({
    by: ["status"],
    where: { creatorId: c.id },
    _count: { _all: true },
  });
  const counts = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
  };
  for (const s of subStats) counts[s.status] = s._count._all;

  return Response.json({ ...c, submissionStats: counts });
});

export const PATCH = route(async (req, { params }) => {
  await requireRole("OPERATOR");
  const id = params?.id ?? "";
  const input = await parseJson(req, operatorCreatorUpdateSchema);

  const existing = await prisma.creator.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw notFound("创作者不存在");

  // 排除未设置的字段;null 显式视作清空
  const data: Record<string, unknown> = {};
  for (const k of [
    "nickname",
    "tier",
    "groupNo",
    "ysId",
    "dyUid",
    "dyName",
    "dyAccount",
    "dyUrl",
  ] as const) {
    if (input[k] !== undefined) data[k] = input[k];
  }

  await prisma.creator.update({ where: { id }, data });
  return Response.json({ ok: true });
});
