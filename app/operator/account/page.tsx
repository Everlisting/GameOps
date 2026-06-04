/**
 * 运营端 · 账户设置
 * 运营 / 管理员自助页:查看账号信息,修改邮箱、修改登录密码。
 * 不在 /operator/admin/* 下,所以 OPERATOR 也能进(只要登录)。
 * 复用创作者端的 EmailForm / PasswordForm:同样打 /api/account/* 接口。
 */
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AccountStatusBadge } from "@/app/operator/creators/_components/AccountStatusBadge";
import { RoleBadge } from "@/app/operator/admin/operators/_components/RoleBadge";
import {
  EmailForm,
  PasswordForm,
} from "@/app/(creator)/dashboard/account/AccountSecurityForm";

export default async function OperatorAccountPage() {
  const session = await requireRole("OPERATOR");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.sub },
    select: {
      username: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const status = (user.status === "pending" || user.status === "active" || user.status === "disabled"
    ? user.status
    : "active") as "pending" | "active" | "disabled";

  return (
    <div className="max-w-3xl p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">账户设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          修改自己的邮箱与登录密码。账号的角色、状态由管理员维护。
        </p>
      </header>

      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">
              {user.username}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {user.email ?? "尚未设置邮箱"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RoleBadge role={user.role} />
            <AccountStatusBadge status={status} />
          </div>
        </div>
        <Separator className="my-4" />
        <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
          <div>创建于 {fmtDateTime(user.createdAt)}</div>
          <div>
            {user.updatedAt.getTime() === user.createdAt.getTime()
              ? "尚未更新过资料"
              : `最近更新 ${fmtDateTime(user.updatedAt)}`}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-medium">账户安全</h2>
        <p className="mt-1 mb-4 text-xs text-muted-foreground">
          修改邮箱或登录密码。密码修改需要提供当前密码。
        </p>
        <div className="space-y-6">
          <EmailForm initialEmail={user.email ?? ""} />
          <Separator />
          <PasswordForm />
        </div>
      </Card>
    </div>
  );
}
