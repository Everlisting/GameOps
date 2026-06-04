/**
 * GET   /api/creators/me — 当前创作者资料
 * PATCH /api/creators/me — 部分更新昵称/头像/外部平台账号
 */
import { route, parseJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/creator";
import { creatorProfileUpdateSchema } from "@/lib/validation/creator";

const SELECT = {
  id: true,
  nickname: true,
  avatarUrl: true,
  groupNo: true,
  ysId: true,
  dyUid: true,
  dyName: true,
  dyAccount: true,
  dyUrl: true,
} as const;

export const GET = route(async () => {
  const { creator, session } = await requireCreator();
  const data = await prisma.creator.findUniqueOrThrow({
    where: { id: creator.id },
    select: SELECT,
  });
  return Response.json({ ...data, username: session.username });
});

export const PATCH = route(async (req) => {
  const { creator } = await requireCreator();
  const input = await parseJson(req, creatorProfileUpdateSchema);
  const updated = await prisma.creator.update({
    where: { id: creator.id },
    data: input,
    select: SELECT,
  });
  return Response.json(updated);
});
