/**
 * 运营数据日报组装(飞书交互卡片)。复用现有口径:VideoStat(hidden=false)本月至今 + 进行中活动。
 */
import { prisma } from "@/lib/db";
import { chinaDateString } from "@/lib/time";
import { cardMessage, type CardSection } from "@/lib/feishu/message";
import type { FeishuPayload } from "@/lib/feishu/client";

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-US");
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 组装今日运营数据日报的飞书卡片 payload。 */
export async function buildDailyReportPayload(): Promise<FeishuPayload> {
  const now = new Date();
  // 本月起(UTC 月首,与视频统计工具口径一致)
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const videoWhere = { hidden: false, publishedAt: { gte: monthStart } } as const;

  const [agg, worksCount, topVideos, ongoing] = await Promise.all([
    prisma.videoStat.aggregate({ where: videoWhere, _sum: { views: true, likes: true } }),
    prisma.videoStat.count({ where: videoWhere }),
    prisma.videoStat.findMany({
      where: videoWhere,
      orderBy: { views: "desc" },
      take: 5,
      select: { title: true, creatorName: true, views: true, url: true },
    }),
    prisma.activity.count({ where: { status: "ONGOING" } }),
  ]);

  const sections: CardSection[] = [
    {
      title: "视频(本月至今)",
      content: `稿件数 **${fmt(worksCount)}** · 总播放量 **${fmt(agg._sum.views)}** · 总点赞 **${fmt(agg._sum.likes)}**`,
    },
    {
      title: "Top5 作品(本月播放量)",
      content:
        topVideos.length > 0
          ? topVideos
              .map((v, i) => {
                // lark_md 链接语法 [文本](url):点击直达稿件;无链接时退回纯标题
                // 清洗标题里的 []，避免破坏 lark_md 链接语法 [文本](url)
                const label = trunc(v.title, 24).replace(/[[\]]/g, " ");
                const titleMd = v.url ? `[${label}](${v.url})` : label;
                return `${i + 1}. ${titleMd} — ${fmt(v.views)}（${v.creatorName ?? "—"}）`;
              })
              .join("\n")
          : "暂无数据",
    },
    { title: "活动", content: `进行中 **${ongoing}** 个` },
  ];

  return cardMessage(`运营数据日报 · ${chinaDateString()}`, sections, "blue");
}
