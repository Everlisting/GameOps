import { Badge } from "@/components/ui/badge";

const MAP: Record<string, { label: string; variant: "warning" | "success" | "destructive" | "muted" }> = {
  pending: { label: "待审核", variant: "warning" },
  active: { label: "已启用", variant: "success" },
  disabled: { label: "已停用", variant: "destructive" },
};

export function AccountStatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? { label: status, variant: "muted" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
