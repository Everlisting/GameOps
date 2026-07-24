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
 *   - 快照每列都是从 VideoStat 直拷,用**一条** INSERT ... SELECT ... ON CONFLICT
 *     DO UPDATE 集合写入,避免逐行 upsert(几千条 SQL 刷屏日志 + 多次 round-trip)。
 */
import { prisma } from "@/lib/db";
import { chinaDateStart } from "@/lib/time";

/**
 * 将本次 dataset 写入的 VideoStat 落一份快照。返回写入/更新的快照行数。
 * @param snapshotDate 快照所属日期(@db.Date,UTC 零点=北京自然日);默认北京时间今天。
 *
 * id 用 `gen_random_uuid()`(PG 核心,≥13);createdAt 走 DB 默认;updatedAt 用 NOW()。
 */
export async function snapshotVideoStatsForDataset(
  datasetId: string,
  snapshotDate: Date = chinaDateStart(),
): Promise<number> {
  // snapshotDate 是 UTC midnight,取 UTC 字段拼 'YYYY-MM-DD' 交给 ::date,避免驱动时区转换
  const ymd = snapshotDate.toISOString().slice(0, 10);
  return prisma.$executeRaw`
    INSERT INTO "DailyVideoStat" (
      "id", "platform", "externalId", "snapshotDate",
      "views", "recommendedViews", "likes", "comments", "shares", "fansGained",
      "creatorId", "videoStatId", "datasetId", "updatedAt"
    )
    SELECT
      gen_random_uuid()::text,
      v."platform", v."externalId", ${ymd}::date,
      v."views", v."recommendedViews", v."likes", v."comments", v."shares", v."fansGained",
      v."creatorId", v."id", ${datasetId},
      NOW()
    FROM "VideoStat" v
    WHERE v."lastDatasetId" = ${datasetId}
    ON CONFLICT ("platform", "externalId", "snapshotDate") DO UPDATE SET
      "views" = EXCLUDED."views",
      "recommendedViews" = EXCLUDED."recommendedViews",
      "likes" = EXCLUDED."likes",
      "comments" = EXCLUDED."comments",
      "shares" = EXCLUDED."shares",
      "fansGained" = EXCLUDED."fansGained",
      "creatorId" = EXCLUDED."creatorId",
      "videoStatId" = EXCLUDED."videoStatId",
      "datasetId" = EXCLUDED."datasetId",
      "updatedAt" = NOW()
  `;
}
