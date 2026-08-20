/**
 * 运营数据日报组装。预览、手动发送和 cron 都从这里取得同一份最终内容。
 */
import { prisma } from "@/lib/db";
import { chinaDateString } from "@/lib/time";
import { cardMessage } from "@/lib/feishu/message";
import { getFeishuReportConfig } from "@/lib/feishu/report-config";
import {
  composeDailyReportPreview,
  type DailyReportData,
  type DailyReportPreview,
  type FeishuReportConfigInput,
} from "@/lib/feishu/report-model";
import type { FeishuPayload } from "@/lib/feishu/client";

/** 读取日报所需的当前数据；热门作品最多取 10 条，最终显示数量由配置决定。 */
export async function getDailyReportData(now: Date = new Date()): Promise<DailyReportData> {
  // 本月起(UTC 月首,与视频统计工具口径一致)
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const videoWhere = { hidden: false, publishedAt: { gte: monthStart } } as const;

  const [agg, worksCount, topVideos, ongoingActivities] = await Promise.all([
    prisma.videoStat.aggregate({ where: videoWhere, _sum: { views: true, likes: true } }),
    prisma.videoStat.count({ where: videoWhere }),
    prisma.videoStat.findMany({
      where: videoWhere,
      orderBy: { views: "desc" },
      take: 10,
      select: { title: true, creatorName: true, views: true, url: true },
    }),
    prisma.activity.count({ where: { status: "ONGOING" } }),
  ]);

  return {
    worksCount,
    totalViews: agg._sum.views ?? 0,
    totalLikes: agg._sum.likes ?? 0,
    ongoingActivities,
    topVideos,
  };
}

/** 解析成页面和飞书发送共用的最终标题/区块。 */
export async function buildDailyReportPreview(
  configInput?: FeishuReportConfigInput,
  now: Date = new Date(),
): Promise<DailyReportPreview> {
  const [config, data] = await Promise.all([
    configInput ? Promise.resolve(configInput) : getFeishuReportConfig(),
    getDailyReportData(now),
  ]);
  return composeDailyReportPreview(config, data, chinaDateString(now));
}

/** 组装今日运营数据日报的飞书卡片 payload。 */
export async function buildDailyReportPayload(): Promise<FeishuPayload> {
  const preview = await buildDailyReportPreview();
  return cardMessage(preview.headerTitle, preview.sections, preview.template);
}
