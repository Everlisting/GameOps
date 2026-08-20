import type { CardSection } from "@/lib/feishu/message";

export const FEISHU_CARD_TEMPLATES = ["blue", "turquoise", "green", "grey"] as const;

export type FeishuCardTemplate = (typeof FEISHU_CARD_TEMPLATES)[number];

export interface FeishuReportConfigInput {
  titleTemplate: string;
  cardTemplate: FeishuCardTemplate;
  intro: string;
  showVideoSummary: boolean;
  videoSummaryTitle: string;
  showTopVideos: boolean;
  topVideosTitle: string;
  topVideoLimit: number;
  showActivities: boolean;
  activitiesTitle: string;
  footer: string;
}

export interface FeishuReportConfigView extends FeishuReportConfigInput {
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface DailyReportVideo {
  title: string;
  creatorName: string | null;
  views: number;
  url: string | null;
}

export interface DailyReportData {
  worksCount: number;
  totalViews: number;
  totalLikes: number;
  ongoingActivities: number;
  topVideos: DailyReportVideo[];
}

export interface DailyReportPreview {
  headerTitle: string;
  template: FeishuCardTemplate;
  sections: CardSection[];
}

export const DEFAULT_FEISHU_REPORT_CONFIG: FeishuReportConfigInput = {
  titleTemplate: "运营数据日报 · {{date}}",
  cardTemplate: "blue",
  intro: "",
  showVideoSummary: true,
  videoSummaryTitle: "视频(本月至今)",
  showTopVideos: true,
  topVideosTitle: "Top{{topN}} 作品(本月播放量)",
  topVideoLimit: 5,
  showActivities: true,
  activitiesTitle: "活动",
  footer: "",
};

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-US");
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

function renderTemplate(value: string, dateText: string, topVideoLimit: number): string {
  return value.replaceAll("{{date}}", dateText).replaceAll("{{topN}}", String(topVideoLimit));
}

/**
 * 把配置和统计数据解析成日报最终内容。页面预览与飞书发送共用此纯函数，避免口径漂移。
 */
export function composeDailyReportPreview(
  config: FeishuReportConfigInput,
  data: DailyReportData,
  dateText: string,
): DailyReportPreview {
  const sections: CardSection[] = [];

  if (config.intro.trim()) sections.push({ content: config.intro.trim() });

  if (config.showVideoSummary) {
    sections.push({
      title: renderTemplate(config.videoSummaryTitle, dateText, config.topVideoLimit),
      content: `稿件数 **${fmt(data.worksCount)}** · 总播放量 **${fmt(data.totalViews)}** · 总点赞 **${fmt(data.totalLikes)}**`,
    });
  }

  if (config.showTopVideos) {
    const topVideos = data.topVideos.slice(0, config.topVideoLimit);
    sections.push({
      title: renderTemplate(config.topVideosTitle, dateText, config.topVideoLimit),
      content:
        topVideos.length > 0
          ? topVideos
              .map((video, index) => {
                const label = trunc(video.title, 24).replace(/[[\]]/g, " ");
                const titleMd = video.url ? `[${label}](${video.url})` : label;
                return `${index + 1}. ${titleMd} — ${fmt(video.views)}（${video.creatorName ?? "—"}）`;
              })
              .join("\n")
          : "暂无数据",
    });
  }

  if (config.showActivities) {
    sections.push({
      title: renderTemplate(config.activitiesTitle, dateText, config.topVideoLimit),
      content: `进行中 **${data.ongoingActivities}** 个`,
    });
  }

  if (config.footer.trim()) sections.push({ content: config.footer.trim() });

  return {
    headerTitle: renderTemplate(config.titleTemplate, dateText, config.topVideoLimit),
    template: config.cardTemplate,
    sections,
  };
}
