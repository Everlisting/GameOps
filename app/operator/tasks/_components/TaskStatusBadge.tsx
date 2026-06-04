import type { CrawlerTaskStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";

const LABEL: Record<CrawlerTaskStatus, string> = {
  PENDING: "待领取",
  RUNNING: "执行中",
  SUCCEEDED: "成功",
  FAILED: "失败",
  CANCELED: "已取消",
};

const VARIANT: Record<
  CrawlerTaskStatus,
  "default" | "secondary" | "success" | "warning" | "destructive" | "muted"
> = {
  PENDING: "secondary",
  RUNNING: "warning",
  SUCCEEDED: "success",
  FAILED: "destructive",
  CANCELED: "muted",
};

export default function TaskStatusBadge({
  status,
}: {
  status: CrawlerTaskStatus;
}) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
