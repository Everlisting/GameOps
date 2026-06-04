import type { Role } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const MAP: Record<
  Role,
  { label: string; variant: "default" | "secondary" | "muted" }
> = {
  CREATOR: { label: "创作者", variant: "muted" },
  OPERATOR: { label: "运营", variant: "secondary" },
  ADMIN: { label: "管理员", variant: "default" },
};

export function RoleBadge({ role }: { role: Role }) {
  const s = MAP[role];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
