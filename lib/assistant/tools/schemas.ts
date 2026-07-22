/**
 * 阶段10 · AI 助手 · 数据工具的「名称 + 描述 + 入参 schema」单一事实来源。
 *
 * 压测 mock 工具(scripts/eval-function-calling.ts)与真实工具(lib/assistant/tools/*, 10.2)共用,
 * 保证压测行为与线上一致。
 *
 * ⚠️ 工具名必须匹配 ^[a-zA-Z0-9_-]+$ —— OpenAI / 国产兼容 function calling 不允许点号,故用下划线。
 */
import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "需 YYYY-MM-DD");

export const streamerProfileInput = z.object({
  q: z.string().optional().describe("UID / 昵称 / 抖音号 模糊搜索"),
  groupNo: z.string().optional().describe("团号"),
  publishedFrom: dateStr.optional().describe("统计窗口起(YYYY-MM-DD;缺省=本月)"),
  publishedTo: dateStr.optional().describe("统计窗口止(YYYY-MM-DD)"),
  sortBy: z
    .enum([
      "worksViews",
      "worksRecommendedViews",
      "worksCount",
      "fansGained",
      "anchorDays",
      "liveDuration",
      "acu",
      "exposureUsers",
      "enterRoomUsers",
    ])
    .optional()
    .describe("排序字段"),
  order: z.enum(["asc", "desc"]).optional().describe("排序方向,默认 desc"),
  limit: z.number().int().min(1).max(50).optional().describe("返回条数,默认 20,最大 50"),
});

export const videoSummaryInput = z.object({
  publishedFrom: dateStr.optional().describe("统计窗口起(缺省=本月)"),
  publishedTo: dateStr.optional().describe("统计窗口止"),
});

export const activitySummaryInput = z.object({
  activityId: z.string().optional().describe("活动 id;不填=列出近期活动概览"),
});

export const incentiveExplainInput = z.object({
  activityId: z.string().describe("活动 id"),
  creatorId: z.string().optional().describe("创作者 id;不填=整活动概览"),
});

export const crawlerTaskStatusInput = z.object({
  status: z
    .enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELED"])
    .optional()
    .describe("按状态过滤"),
  limit: z.number().int().min(1).max(50).optional().describe("返回条数,默认 20"),
});

/** 工具定义(名称 + 描述 + 入参),压测与真实工具共用。描述写清「何时调用」以帮助较弱模型选对工具。 */
export const TOOL_DEFS = {
  streamerProfile: {
    name: "data_streamer_profile",
    description:
      "查询主播的作品/直播/涨粉综合数据。当用户问某主播表现、某团涨粉/播放/直播时长的 Top N 排名、或按团号/日期筛选主播数值时调用。只读,不修改任何数据。",
    input: streamerProfileInput,
  },
  videoSummary: {
    name: "data_video_summary",
    description:
      "统计视频总量指标(总播放量、稿件数等)。当用户问某时间段视频的整体播放量/稿件数/趋势时调用。只读。",
    input: videoSummaryInput,
  },
  activitySummary: {
    name: "activity_summary",
    description:
      "查询活动概览:报名数、投稿数、审核情况、激励预估。不填 activityId 时列出近期活动;当用户问某活动整体情况、或需要先定位一个活动时调用。只读。",
    input: activitySummaryInput,
  },
  incentiveExplain: {
    name: "incentive_explain",
    description:
      "解释某活动下某创作者的激励预估(命中规则、每条贡献、候选口径=报名∪投稿)。当用户问某人的激励是怎么算出来的时调用;需要 activityId(可先用 activity_summary 定位)。只读。",
    input: incentiveExplainInput,
  },
  crawlerTaskStatus: {
    name: "crawler_task_status",
    description:
      "查询爬虫采集任务的状态、失败原因和日志摘要。当用户问任务是否失败/卡住/最近执行情况时调用。只读。",
    input: crawlerTaskStatusInput,
  },
} as const;

export type ToolKey = keyof typeof TOOL_DEFS;
