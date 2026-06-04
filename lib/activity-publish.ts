/**
 * 定时发布的「读时懒执行」:扫描所有到点的草稿活动,推到 ONGOING。
 * 阶段 3 没有 cron,所以列表 / 详情页 server 渲染前调用一次,够内部工具的时效。
 * 阶段 4 接入 Agent / 调度后,改成定时触发,这里可以拆掉。
 */
import { prisma } from "@/lib/db";

/** 把所有 publishAt <= now 的草稿活动一次性推到 ONGOING。返回被推动的条数。 */
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
