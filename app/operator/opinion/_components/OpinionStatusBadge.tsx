import { Badge } from "@/components/ui/badge";

/** 与 slg_analyzer/service SQLite status 一致的 4 态 badge。 */
export function OpinionStatusBadge({
  status,
}: {
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED" | string;
}) {
  switch (status) {
    case "PENDING":
      return <Badge variant="muted">排队中</Badge>;
    case "RUNNING":
      return (
        <Badge variant="muted" className="border-blue-400/50 text-blue-600">
          分析中
        </Badge>
      );
    case "DONE":
      return (
        <Badge variant="muted" className="border-emerald-400/50 text-emerald-600">
          已完成
        </Badge>
      );
    case "FAILED":
      return <Badge variant="destructive">失败</Badge>;
    default:
      return <Badge variant="muted">{status}</Badge>;
  }
}

/** 供 select 用的状态选项。 */
export const OPINION_STATUS_OPTIONS = [
  { value: "", label: "全部" },
  { value: "PENDING", label: "排队中" },
  { value: "RUNNING", label: "分析中" },
  { value: "DONE", label: "已完成" },
  { value: "FAILED", label: "失败" },
] as const;
