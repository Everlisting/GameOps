/**
 * 状态标签:活动状态 / 投稿状态共用。纯展示,无业务。
 */
import { Badge } from "@/components/ui/badge";

const SUBMISSION_STYLE = {
  PENDING: { label: "待审核", variant: "warning" },
  APPROVED: { label: "已通过", variant: "success" },
  REJECTED: { label: "未通过", variant: "destructive" },
} as const;

const ACTIVITY_STYLE = {
  DRAFT: { label: "未开始", variant: "muted" },
  ONGOING: { label: "进行中", variant: "success" },
  ENDED: { label: "已结束", variant: "muted" },
} as const;

type ActivityStatus = keyof typeof ACTIVITY_STYLE;
type SubmissionStatus = keyof typeof SUBMISSION_STYLE;

export function ActivityBadge({ status }: { status: ActivityStatus }) {
  const s = ACTIVITY_STYLE[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function SubmissionBadge({ status }: { status: SubmissionStatus }) {
  const s = SUBMISSION_STYLE[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
