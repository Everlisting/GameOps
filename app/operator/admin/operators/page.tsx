/**
 * 管理员 · 运营账户管理 · 列表
 * 仅 ADMIN 可见(布局已做角色校验)。
 * 过滤:?role= OPERATOR|ADMIN / ?status= active|disabled / ?q=
 * 顶部:新建账户 按钮
 */
import type { Prisma, Role } from "@prisma/client";
type OperatorRole = Extract<Role, "REVIEWER" | "OPERATOR" | "ADMIN">;
import Link from "next/link";
import { Plus } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { STAFF_ROLES } from "@/lib/roles";
import { fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AccountStatusBadge } from "@/app/operator/creators/_components/AccountStatusBadge";
import { RoleBadge } from "./_components/RoleBadge";
import OperatorUserFilters from "./_components/OperatorUserFilters";

const ROLE_VALUES: readonly OperatorRole[] = STAFF_ROLES;
const STATUS_VALUES = ["active", "disabled"] as const;

export default async function AdminOperatorsPage({
  searchParams,
}: {
  searchParams?: { role?: string; status?: string; q?: string };
}) {
  const session = await requireRole("ADMIN");

  const role = ROLE_VALUES.includes(searchParams?.role as OperatorRole)
    ? (searchParams!.role as OperatorRole)
    : undefined;
  const status = STATUS_VALUES.includes(
    searchParams?.status as (typeof STATUS_VALUES)[number],
  )
    ? (searchParams!.status as (typeof STATUS_VALUES)[number])
    : undefined;
  const q = searchParams?.q?.trim() ?? "";

  const where: Prisma.UserWhereInput = {
    role: role ? role : { in: [...STAFF_ROLES] },
  };
  if (status) where.status = status;
  if (q) where.OR = [
    { username: { contains: q, mode: "insensitive" } },
    { displayName: { contains: q, mode: "insensitive" } },
  ];

  const items = await prisma.user.findMany({
    where,
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">运营账户管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            创建、调整审核 / 运营 / 管理员账户。创作者账户由「创作者管理」处理。
          </p>
        </div>
        <Button asChild>
          <Link href="/operator/admin/operators/new">
            <Plus className="size-4" />
            新建账户
          </Link>
        </Button>
      </header>

      <Card className="mb-5 p-4">
        <OperatorUserFilters />
        <p className="mt-3 text-xs text-muted-foreground">共 {items.length} 个账户</p>
      </Card>

      {items.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          {q ? `没有匹配 "${q}" 的账户。` : "还没有后台账户。"}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">用户名</th>
                <th className="px-4 py-2.5 font-medium">账号名称</th>
                <th className="px-4 py-2.5 font-medium">角色</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-4 py-2.5 font-medium">创建时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/operator/admin/operators/${u.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {u.displayName ?? u.username}
                    </Link>
                    {u.id === session?.sub && (
                      <Badge variant="outline" className="ml-2">
                        当前登录
                      </Badge>
                    )}
                    {u.email && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {u.email}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{u.username}</td>
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3">
                    <AccountStatusBadge status={u.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {fmtDate(u.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
