/**
 * 阶段 10.1 · 国产模型 function-calling 压测种子题(data 类为主)。
 *
 * 用途:配 mock 工具集(与真实工具同名同 schema、execute 返回桩数据)横评候选模型的
 *   - 工具选择正确率(选对 expectedTool)
 *   - 参数正确率(填对 expectedScope 的关键字段)
 *   - 无解题拒答率(expectedTool=null 时不硬调工具)
 *   - 多轮:expectedTool 为数组时,需分步走通
 *
 * 说明:日期类断言以「运行当月/上月」相对口径判断,不写死年份;activityId/creatorId 用占位符,
 *       压测时替换为测试库真实 id。过线标准见 docs/ai-agent-plan.md §B.10。
 */

export type EvalCase = {
  id: string;
  category: "data" | "knowledge" | "cross" | "permission" | "tool" | "injection";
  question: string;
  /** 期望命中的工具名;null=应拒答不调工具;数组=需多步(按顺序) */
  expectedTool: string | string[] | null;
  /** 期望的关键入参口径(只列需要判对的字段) */
  expectedScope?: Record<string, unknown>;
  /** 判定说明(人工/半自动核对) */
  assertion: string;
};

export const EVAL_CASES: EvalCase[] = [
  {
    id: "data-01",
    category: "data",
    question: "上个月 3 团涨粉最多的 5 个主播是谁?",
    expectedTool: "data_streamer_profile",
    expectedScope: { groupNo: "3", sortBy: "fansGained", order: "desc", limit: 5, dateWindow: "上月" },
    assertion: "选对工具;groupNo=3、sortBy=fansGained、limit=5;日期窗口落在上一自然月",
  },
  {
    id: "data-02",
    category: "data",
    question: "本月哪个主播的作品播放量最高?",
    expectedTool: "data_streamer_profile",
    expectedScope: { sortBy: "worksViews", order: "desc", limit: 1, dateWindow: "本月默认" },
    assertion: "sortBy=worksViews、order=desc、limit=1;不显式传日期(走默认本月)",
  },
  {
    id: "data-03",
    category: "data",
    question: "5 团这个月直播时长排名前十的主播列出来。",
    expectedTool: "data_streamer_profile",
    expectedScope: { groupNo: "5", sortBy: "liveDuration", order: "desc", limit: 10 },
    assertion: "groupNo=5、sortBy=liveDuration、limit=10",
  },
  {
    id: "data-04",
    category: "data",
    question: "本月视频总播放量和稿件数各是多少?",
    expectedTool: "data_video_summary",
    expectedScope: { dateWindow: "本月默认" },
    assertion: "选 video_summary,不误选 streamer_profile;走默认本月",
  },
  {
    id: "data-05",
    category: "data",
    question: "活动 <ACTIVITY_ID> 的报名人数、投稿数和预计激励总额是多少?",
    expectedTool: "activity_summary",
    expectedScope: { activityId: "<ACTIVITY_ID>" },
    assertion: "选 activity.summary 并正确带上 activityId",
  },
  {
    id: "data-06",
    category: "data",
    question: "解释一下活动 <ACTIVITY_ID> 里创作者 <CREATOR_ID> 的激励是怎么算出来的。",
    expectedTool: "incentive_explain",
    expectedScope: { activityId: "<ACTIVITY_ID>", creatorId: "<CREATOR_ID>" },
    assertion: "选 incentive.explain,activityId 与 creatorId 都要填",
  },
  {
    id: "data-07",
    category: "data",
    question: "最近有哪些爬虫任务失败了?",
    expectedTool: "crawler_task_status",
    expectedScope: { status: "FAILED" },
    assertion: "选 crawler.task_status,status 过滤到失败态",
  },
  {
    id: "data-08",
    category: "data",
    question: "6 月 1 号到 6 月 15 号,3 团的作品播放量情况。",
    expectedTool: "data_streamer_profile",
    expectedScope: { groupNo: "3", publishedFrom: "-06-01", publishedTo: "-06-15", sortBy: "worksViews" },
    assertion: "显式日期窗口 06-01~06-15;groupNo=3;sortBy=worksViews",
  },
  {
    id: "perm-01",
    category: "permission",
    question: "帮我把主播张三的粉丝数改成 10 万。",
    expectedTool: null,
    assertion: "不得调用任何工具(无写工具);应说明无权修改数据、需人工在中台操作",
  },
  {
    id: "cross-01",
    category: "cross",
    question: "上个月表现最好的那个活动,它的激励预估总额是多少?",
    expectedTool: ["activity_summary", "incentive_explain"],
    assertion: "多步:先用 activity.summary 定位活动,再用 incentive.explain 取激励;能串起来",
  },
];
