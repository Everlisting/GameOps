import { describe, expect, it } from "vitest";

import {
  composeDailyReportPreview,
  DEFAULT_FEISHU_REPORT_CONFIG,
  type DailyReportData,
} from "@/lib/feishu/report-model";

const data: DailyReportData = {
  worksCount: 12,
  totalViews: 123456,
  totalLikes: 7890,
  ongoingActivities: 3,
  topVideos: [
    { title: "第一名作品", creatorName: "创作者 A", views: 9999, url: "https://example.com/1" },
    { title: "第二名作品", creatorName: null, views: 8888, url: null },
  ],
};

describe("composeDailyReportPreview", () => {
  it("默认配置保持原日报的标题、三块数据与 Top5 口径", () => {
    const preview = composeDailyReportPreview(DEFAULT_FEISHU_REPORT_CONFIG, data, "2026-08-10");

    expect(preview.headerTitle).toBe("运营数据日报 · 2026-08-10");
    expect(preview.template).toBe("blue");
    expect(preview.sections).toHaveLength(3);
    expect(preview.sections[0]).toEqual({
      title: "视频(本月至今)",
      content: "稿件数 **12** · 总播放量 **123,456** · 总点赞 **7,890**",
    });
    expect(preview.sections[1]?.title).toBe("Top5 作品(本月播放量)");
    expect(preview.sections[1]?.content).toContain("[第一名作品](https://example.com/1)");
    expect(preview.sections[2]).toEqual({ title: "活动", content: "进行中 **3** 个" });
  });

  it("按配置隐藏模块、限制热门作品数量并插入自定义内容", () => {
    const preview = composeDailyReportPreview(
      {
        ...DEFAULT_FEISHU_REPORT_CONFIG,
        titleTemplate: "日报 / {{date}}",
        cardTemplate: "green",
        intro: "**今日重点**",
        showVideoSummary: false,
        topVideosTitle: "前 {{topN}} 名",
        topVideoLimit: 1,
        showActivities: false,
        footer: "数据仅供内部参考",
      },
      data,
      "2026-08-10",
    );

    expect(preview.headerTitle).toBe("日报 / 2026-08-10");
    expect(preview.template).toBe("green");
    expect(preview.sections).toEqual([
      { content: "**今日重点**" },
      {
        title: "前 1 名",
        content: "1. [第一名作品](https://example.com/1) — 9,999（创作者 A）",
      },
      { content: "数据仅供内部参考" },
    ]);
  });
});
