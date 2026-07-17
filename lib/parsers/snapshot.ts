/**
 * 写时聚合:Detail(VideoStat)写完后,立刻把本次 dataset 写入的所有行
 * 复制一份到 DailyVideoStat(以"北京时间今日"为 snapshotDate)。
 *
 * 同一天多次上传同一 csvType 的 CSV 时,后者 upsert 覆盖前者
 * → 每日快照永远是"当日最近一次累计值"。
 *
 * 决策:
 *   - 触发点放在 Result 端点,不嵌进 parser,parser 维持纯粹
 *   - 按 csvType 注册 snapshotter(getSnapshotter),其他类型(后续如 CreatorStat)同模式
 *   - 失败不影响 Detail 已写入的数据;Result 端点会把错误写到 RawDataset.parseError
 *   - snapshotDate 可由调用方指定(手动导入允许选「数据所属日期」,常是 T-1);
 *     不传则用北京时间今天(爬虫上报保持原行为)
 */
import { prisma } from "@/lib/db";
import { chinaDateStart } from "@/lib/time";

const BATCH = 100;

/**
 * 将本次 dataset 写入的 VideoStat 落一份快照。返回写入快照行数。
 * @param snapshotDate 快照所属日期(@db.Date,UTC 零点=北京自然日);默认北京时间今天。
 */
export async function snapshotVideoStatsForDataset(
  datasetId: string,
  snapshotDate: Date = chinaDateStart(),
): Promise<number> {
  const stats = await prisma.videoStat.findMany({
    where: { lastDatasetId: datasetId },
    select: {
      id: true,
      platform: true,
      externalId: true,
      views: true,
      recommendedViews: true,
      likes: true,
      comments: true,
      shares: true,
      fansGained: true,
      creatorId: true,
    },
  });
  if (stats.length === 0) return 0;

  for (let i = 0; i < stats.length; i += BATCH) {
    const batch = stats.slice(i, i + BATCH);
    await prisma.$transaction(
      batch.map((s) => {
        const shared = {
          views: s.views,
          recommendedViews: s.recommendedViews,
          likes: s.likes,
          comments: s.comments,
          shares: s.shares,
          fansGained: s.fansGained,
          creatorId: s.creatorId,
          videoStatId: s.id,
          datasetId,
        };
        return prisma.dailyVideoStat.upsert({
          where: {
            platform_externalId_snapshotDate: {
              platform: s.platform,
              externalId: s.externalId,
              snapshotDate,
            },
          },
          create: {
            platform: s.platform,
            externalId: s.externalId,
            snapshotDate,
            ...shared,
          },
          update: shared,
        });
      }),
    );
  }
  return stats.length;
}
