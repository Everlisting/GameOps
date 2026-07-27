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
  q: z
    .string()
    .optional()
    .describe(
      "按关键词/话题标签筛选(匹配作品标题或创作者昵称,如话题标签「率土三国懂王」);做某赛道/话题的全量统计时用",
    ),
});

export const videoRankInput = z.object({
  dateFrom: dateStr
    .optional()
    .describe("统计窗口起(YYYY-MM-DD;缺省=本月)。播放/点赞等按视频发布日期;增长类按数据观察日期(每日快照)"),
  dateTo: dateStr.optional().describe("统计窗口止(YYYY-MM-DD)"),
  sortBy: z
    .enum([
      "views",
      "recommendedViews",
      "likes",
      "comments",
      "shares",
      "fansGained",
      "viewsGrowth",
      "viewsGrowthRate",
    ])
    .optional()
    .describe("排序指标,默认 views。viewsGrowth=观察期播放量净增;viewsGrowthRate=净增率"),
  order: z.enum(["asc", "desc"]).optional().describe("排序方向,默认 desc"),
  limit: z.number().int().min(1).max(50).optional().describe("返回条数,默认 10,最大 50"),
  q: z.string().optional().describe("作品标题 / 创作者昵称 模糊搜索"),
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

export const knowledgeSearchInput = z.object({
  query: z.string().min(1).describe("要检索的问题或关键词"),
  k: z.number().int().min(1).max(10).optional().describe("返回条数,默认 5"),
});

export const incentiveComputeInput = z.object({
  activityId: z.string().describe("要重算激励的活动 id(可先用 activity_summary 定位)"),
});

export const crawlerTaskRerunInput = z.object({
  taskId: z.string().describe("要重跑的采集任务 id(可先用 crawler_task_status 定位)"),
});

export const crawlerTaskCancelInput = z.object({
  taskId: z.string().describe("要取消的采集任务 id(可先用 crawler_task_status 定位)"),
});

export const activityStatusInput = z.object({
  activityId: z.string().describe("活动 id(可先用 activity_summary 定位)"),
  status: z.enum(["ONGOING", "ENDED"]).describe("目标状态:ONGOING=上线/开始;ENDED=结束/下线"),
});

export const activityUpdateInput = z.object({
  activityId: z.string().describe("活动 id(可先用 activity_summary 定位)"),
  name: z.string().optional().describe("新活动名称"),
  description: z.string().optional().describe("新活动简介"),
  startAt: z.string().optional().describe("新开始时间(YYYY-MM-DD 或 ISO 日期时间)"),
  endAt: z.string().optional().describe("新结束时间(YYYY-MM-DD 或 ISO 日期时间)"),
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
      "统计视频总量指标(总播放量、稿件数、去重创作者数等),**全量聚合**——不限条数、返回汇总数字而非逐条,适合全量(非 TOP N)分析。可按关键词/话题标签(q)筛选做某赛道/话题的全量统计(如对比两个话题时,分别用各自话题 q 调一次)。当用户要整体/全量/某话题的播放量·稿件数·创作者数时调用。只读。",
    input: videoSummaryInput,
  },
  videoRank: {
    name: "data_video_rank",
    description:
      "查询/排名单条作品(视频)。当用户问 TOP N 作品、某作品的播放/点赞排名、或作品播放量增长(率)时调用——这是作品级(单条视频)接口,区别于 data_streamer_profile(主播级汇总)、data_video_summary(总量)。支持按 播放/推荐播放/点赞/评论/分享/涨粉 排序,以及 viewsGrowth / viewsGrowthRate(基于每日快照的观察期净增/净增率,需窗口内有多天快照数据)。只读。",
    input: videoRankInput,
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
  knowledgeSearch: {
    name: "knowledge_search",
    description:
      "检索企业知识库(运营手册 / 活动规则 / SOP / 平台政策 / 历史复盘等文档)。当用户问制度、规则、流程、政策、复盘结论等文档类问题时调用;返回相关片段与来源文档,回答时须标注来源文档标题。",
    input: knowledgeSearchInput,
  },
  incentiveCompute: {
    name: "incentive_compute",
    description:
      "【写操作·需人工审批】发起「全活动重算预估激励」。当用户要求重新计算/刷新某活动的激励预估时调用。**每次这类请求都必须实际调用本工具生成一条新的待审批**——严禁凭记忆复述、复用历史审批单号或直接编造审批结果。此工具不会立即执行,只生成待审批,须运营点击「批准」后才真正重算。需要 activityId(可先用 activity_summary 定位)。",
    input: incentiveComputeInput,
  },
  crawlerTaskRerun: {
    name: "crawler_task_rerun",
    description:
      "【写操作·需人工审批】重跑一条采集任务(基于原任务的 Job+参数克隆一条新任务,原任务不动)。当用户要求重跑/重新执行某个采集任务时调用。**每次都必须实际调用本工具生成新的待审批**,不得凭记忆复述。只生成待审批,须运营批准后才执行。需要 taskId(可先用 crawler_task_status 定位)。",
    input: crawlerTaskRerunInput,
  },
  crawlerTaskCancel: {
    name: "crawler_task_cancel",
    description:
      "【写操作·需人工审批】取消一条采集任务(PENDING/RUNNING/FAILED 可取消,RUNNING 会通知 Agent kill 子进程;已完成不可取消)。当用户要求取消/停止某个采集任务时调用。**每次都必须实际调用本工具生成新的待审批**。只生成待审批,须运营批准后才执行。需要 taskId(可先用 crawler_task_status 定位)。",
    input: crawlerTaskCancelInput,
  },
  activityStatus: {
    name: "activity_status",
    description:
      "【写操作·需人工审批】切换活动状态:上线(DRAFT→ONGOING)或结束(ONGOING→ENDED)。当用户要求上线/开始/发布 或 结束/下线某活动时调用。**每次都必须实际调用本工具生成新的待审批**。只生成待审批,须运营批准后才执行。需要 activityId(可先用 activity_summary 定位)。",
    input: activityStatusInput,
  },
  activityUpdate: {
    name: "activity_update",
    description:
      "【写操作·需人工审批(管理员)】修改活动基础信息:名称 / 简介 / 开始时间 / 结束时间。当用户要求修改/编辑某活动的这些字段时调用。不改激励规则(那需在中台规则编辑器操作)。**每次都必须实际调用本工具生成新的待审批**,并只带用户明确要改的字段。只生成待审批,须管理员批准后才生效。需要 activityId + 至少一个要改的字段(可先用 activity_summary 定位活动)。",
    input: activityUpdateInput,
  },
} as const;

export type ToolKey = keyof typeof TOOL_DEFS;
