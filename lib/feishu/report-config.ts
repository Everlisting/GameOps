import { feishuReportConfigDb, type FeishuReportConfigRow } from "@/lib/feishu/db";
import {
  DEFAULT_FEISHU_REPORT_CONFIG,
  FEISHU_CARD_TEMPLATES,
  type FeishuCardTemplate,
  type FeishuReportConfigInput,
  type FeishuReportConfigView,
} from "@/lib/feishu/report-model";

function cardTemplate(value: string): FeishuCardTemplate {
  return FEISHU_CARD_TEMPLATES.includes(value as FeishuCardTemplate)
    ? (value as FeishuCardTemplate)
    : DEFAULT_FEISHU_REPORT_CONFIG.cardTemplate;
}

function topVideoLimit(value: number): number {
  return Number.isInteger(value) && value >= 1 && value <= 10
    ? value
    : DEFAULT_FEISHU_REPORT_CONFIG.topVideoLimit;
}

function toView(row: FeishuReportConfigRow | null): FeishuReportConfigView {
  if (!row) {
    return {
      ...DEFAULT_FEISHU_REPORT_CONFIG,
      updatedBy: null,
      updatedAt: null,
    };
  }

  return {
    titleTemplate: row.titleTemplate,
    cardTemplate: cardTemplate(row.cardTemplate),
    intro: row.intro,
    showVideoSummary: row.showVideoSummary,
    videoSummaryTitle: row.videoSummaryTitle,
    showTopVideos: row.showTopVideos,
    topVideosTitle: row.topVideosTitle,
    topVideoLimit: topVideoLimit(row.topVideoLimit),
    showActivities: row.showActivities,
    activitiesTitle: row.activitiesTitle,
    footer: row.footer,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getFeishuReportConfig(): Promise<FeishuReportConfigView> {
  return toView(await feishuReportConfigDb.findUnique({ where: { id: 1 } }));
}

export async function saveFeishuReportConfig(
  input: FeishuReportConfigInput,
  updatedBy: string,
): Promise<FeishuReportConfigView> {
  const row = await feishuReportConfigDb.upsert({
    where: { id: 1 },
    create: { id: 1, ...input, updatedBy },
    update: { ...input, updatedBy },
  });
  return toView(row);
}
