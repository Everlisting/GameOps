/**
 * 管理员 · 运营账户管理 · 详情 / 编辑
 * 顶部:用户名 + 角色 + 状态;主体:角色/状态、重置密码、危险操作。
 * 自伤防护(isSelf):无法改自己角色/状态/删自己;改自己密码请走「账户设置」。
 */
import Link from "next/link";
import { notFound as nextNotFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { AccountStatusBadge } from "@/app/operator/creators/_components/AccountStatusBadge";
import { RoleBadge } from "../_components/RoleBadge";
import OperatorUserEditForm from "../_components/OperatorUserEditForm";

export default async function OperatorUserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await requireRole("ADMIN");

  const u = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!u || u.role === "CREATOR") nextNotFound();

  const isSelf = u.id === session.sub;
  const status = (u.status === "pending" || u.status === "active" || u.status === "disabled"
    ? u.status
    : "active") as "pending" | "active" | "disabled";

  return (
    <div className="p-8">
      <div className="mb-4">
        <Link
          href="/operator/admin/operators"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          返回账户列表
        </Link>
      </div>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">
            {u.username}
            {isSelf && (
              <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">
                (当前登录)
              </span>
            )}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <RoleBadge role={u.role} />
            <AccountStatusBadge status={status} />
            <span>创建于 {fmtDateTime(u.createdAt)}</span>
            {u.updatedAt.getTime() !== u.createdAt.getTime() && (
              <span>· 最近更新 {fmtDateTime(u.updatedAt)}</span>
            )}
          </div>
        </div>
      </header>

      <Card className="mb-6 grid gap-3 p-4 text-sm sm:grid-cols-3">
        <Field label="用户名" value={u.username} mono />
        <Field label="邮箱" value={u.email ?? "—"} />
        <Field label="账号 ID" value={u.id} mono />
      </Card>

      <OperatorUserEditForm
        initial={{
          id: u.id,
          username: u.username,
          role: u.role,
          status,
        }}
        isSelf={isSelf}
      />
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 truncate ${mono ? "font-mono text-xs" : ""}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
