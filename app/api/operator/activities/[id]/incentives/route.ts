/**
 * GET /api/operator/activities/[id]/incentives
 *   列出本活动的全部激励行。前端表格用。
 *
 * 返回:
 *   items[] — 每行带创作者基本信息 + estimated / adjusted / breakdown / adjustedBy 名
 *   summary — 总人数 / estimated 总额 / adjusted 总额 / 最近 computedAt
 *
 * 不分页:单活动最多几百人,前端表格自己排序/筛选。
 */
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { badRequest, notFound } from "@/lib/errors";
import { incentiveDb } from "@/lib/incentive/db";

export const GET = route(async (_req, { params }) => {
  await requireRole("OPERATOR");
  const activityId = params?.id ?? "";
  if (!activityId) throw badRequest("缺少活动 id");

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { id: true, name: true },
  });
  if (!activity) throw notFound("活动不存在");

  const rows = await incentiveDb.findMany({
    where: { activityId },
    orderBy: [{ adjusted: "desc" }, { estimated: "desc" }],
  });

  // 一次拉创作者基本信息 + adjustedBy 用户名
  const creatorIds = Array.from(new Set(rows.map((r) => r.creatorId)));
  const adjusterIds = Array.from(
    new Set(rows.map((r) => r.adjustedById).filter((x): x is string => !!x)),
  );

  const [creators, adjusters] = await Promise.all([
    creatorIds.length
      ? prisma.creator.findMany({
          where: { id: { in: creatorIds } },
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
            user: { select: { username: true } },
          },
        })
      : Promise.resolve([]),
    adjusterIds.length
      ? prisma.user.findMany({
          where: { id: { in: adjusterIds } },
          select: { id: true, username: true },
        })
      : Promise.resolve([]),
  ]);
  const creatorMap = new Map(creators.map((c) => [c.id, c]));
  const adjusterMap = new Map(adjusters.map((u) => [u.id, u.username]));

  let totalEstimated = 0;
  let totalAdjusted = 0;
  let totalFinal = 0; // adjusted ?? estimated 之和(给运营看"实际要发多少")
  let latestComputedAt: Date | null = null;

  const items = rows.map((r) => {
    const c = creatorMap.get(r.creatorId);
    const est = Number(r.estimated);
    const adj = r.adjusted == null ? null : Number(r.adjusted);
    const final = adj ?? est;
    totalEstimated += est;
    if (adj != null) totalAdjusted += adj;
    totalFinal += final;
    if (!latestComputedAt || r.computedAt > latestComputedAt) {
      latestComputedAt = r.computedAt;
    }
    return {
      id: r.id,
      creatorId: r.creatorId,
      nickname: c?.nickname ?? "(已删除)",
      username: c?.user.username ?? "—",
      avatarUrl: c?.avatarUrl ?? null,
      estimated: est,
      adjusted: adj,
      adjustReason: r.adjustReason,
      adjustedBy: r.adjustedById ? adjusterMap.get(r.adjustedById) ?? null : null,
      adjustedAt: r.adjustedAt ? r.adjustedAt.toISOString() : null,
      breakdown: r.breakdown,
      computedAt: r.computedAt.toISOString(),
    };
  });

  return Response.json({
    summary: {
      activityId,
      activityName: activity.name,
      total: items.length,
      adjustedCount: rows.filter((r) => r.adjusted != null).length,
      totalEstimated: Number(totalEstimated.toFixed(2)),
      totalAdjusted: Number(totalAdjusted.toFixed(2)),
      totalFinal: Number(totalFinal.toFixed(2)),
      latestComputedAt: latestComputedAt
        ? (latestComputedAt as Date).toISOString()
        : null,
    },
    items,
  });
});
