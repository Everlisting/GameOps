/**
 * 活动状态的「读时懒执行」:两个转移都用同一模式(阶段 4 接入 Agent 后可拆掉走 cron)。
 *
 *   DRAFT   → ONGOING:publishAt <= now
 *   ONGOING → ENDED  :endAt    <= now
 *
 * 触发点:运营端列表/详情页 server 渲染前 + 写路径(报名 / 投稿)入库前调一次,
 * 保证到点活动不会被残留的 ONGOING 状态误开放。
 */
import { prisma } from "@/lib/db";

/** DRAFT + publishAt <= now → ONGOING。返回被推动的条数。 */
export async function autoPublishDue(): Promise<number> {
  const res = await prisma.activity.updateMany({
    where: {
      status: "DRAFT",
      publishAt: { lte: new Date() },
    },
    data: { status: "ONGOING" },
  });
  return res.count;
}

/** ONGOING + endAt <= now → ENDED。返回被推动的条数。 */
export async function autoEndDue(): Promise<number> {
  const res = await prisma.activity.updateMany({
    where: {
      status: "ONGOING",
      endAt: { lte: new Date() },
    },
    data: { status: "ENDED" },
  });
  return res.count;
}

/**
 * 顺序跑两个转移:先 publish 再 end。
 * 处理"publishAt 与 endAt 都过期"的极端 DRAFT:先 → ONGOING,再 → ENDED,单次调用两阶段推齐。
 */
export async function autoTransitionActivities(): Promise<{ published: number; ended: number }> {
  const published = await autoPublishDue();
  const ended = await autoEndDue();
  return { published, ended };
}
