/**
 * 运营端 · 管理面板布局
 * 在 OperatorLayout 之内再加一层 ADMIN 角色校验,保护 /operator/admin/* 下所有页面。
 */
import { requireRole } from "@/lib/rbac";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("ADMIN");
  return <>{children}</>;
}
