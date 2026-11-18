/** 旧四入口保留配置以便追溯；不再渲染旧活动卡片审核视图。 */
export const LEGACY_SUBMISSION_PAGES = [
  { title: "全部稿件（旧版）", url: "/operator/submissions", enabled: false },
  {
    title: "待审核",
    url: "/operator/submissions?status=PENDING",
    enabled: false,
  },
  {
    title: "已通过",
    url: "/operator/submissions?status=APPROVED",
    enabled: false,
  },
  {
    title: "未通过",
    url: "/operator/submissions?status=REJECTED",
    enabled: false,
  },
] as const;

export const SUBMISSION_NAV_ITEMS = [
  { title: "全部稿件", url: "/operator/submissions" },
  { title: "稿件审核", url: "/operator/submissions/review" },
  { title: "审核标签", url: "/operator/submissions/tags" },
];
