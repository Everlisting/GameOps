/**
 * 审计日志枚举值 → 中文标签。
 * 仅供 audit-logs 页面的 Filter 下拉与表格列展示使用。
 * 新增 action / targetType 时同步补一条。未识别的值在表格里原样显示 + 灰色提示。
 */

export const ACTION_LABEL: Record<string, string> = {
  "task.trigger": "触发任务",
  "task.cancel": "取消任务",
  "task.requeue": "重排任务",
  "task.rerun": "重跑任务",
  "task.delete": "删除任务",
  "task.priority": "改优先级",
  "job.create": "创建 Job",
  "job.update": "修改 Job",
  "job.delete": "删除 Job",
  "job.toggle": "启停 Job",
  "agent.create": "新增爬虫机",
  "agent.update": "修改爬虫机",
  "agent.delete": "删除爬虫机",
  "agent.rotateToken": "轮换 Token",
  "incentive.compute": "重算激励",
  "incentive.adjust": "调整激励",
  "reviewTag.create": "新增审核标签",
  "reviewTag.update": "修改审核标签",
  "reviewTag.delete": "删除审核标签",
  "video.review": "视频审核",
  "video.review.batch": "批量视频审核",
  "video.assignment": "稿件审核分配",
  "submissionPeriod.create": "新建稿件统计",
  "submissionPeriod.update": "修改稿件统计",
  "feishu.report.update": "修改飞书日报配置",
};

export const TARGET_TYPE_LABEL: Record<string, string> = {
  task: "任务",
  job: "Job",
  agent: "爬虫机",
  dataset: "数据集",
  user: "用户",
  activity: "活动",
  incentive: "激励",
  review_tag: "审核标签",
  video: "视频",
  submission_period: "稿件统计",
  feishu_report_config: "飞书日报配置",
};

/** 把 "task.trigger" 切成命名空间("task") + 中文动作 */
export function describeAction(action: string): {
  namespace: string;
  label: string;
} {
  const dot = action.indexOf(".");
  const namespace = dot > 0 ? action.slice(0, dot) : action;
  const label = ACTION_LABEL[action] ?? action;
  return { namespace, label };
}
