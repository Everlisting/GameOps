/**
 * 创作者端 · 账户设置
 * 资料展示 + 编辑(昵称/头像预设/外部平台账号);账户安全(邮箱、密码)。
 */
import { prisma } from "@/lib/db";
import { requireCreator } from "@/lib/creator";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CreatorAvatar } from "@/components/creator-avatar";
import AccountForm from "./AccountForm";
import { EmailForm, PasswordForm } from "./AccountSecurityForm";

export default async function AccountPage() {
  const { creator, session } = await requireCreator();
  const [profile, user] = await Promise.all([
    prisma.creator.findUniqueOrThrow({
      where: { id: creator.id },
      select: {
        nickname: true,
        avatarUrl: true,
        groupNo: true,
        ysId: true,
        dyName: true,
        dyAccount: true,
        dyUrl: true,
      },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: session.sub },
      select: { email: true },
    }),
  ]);

  return (
    <div className="p-8 max-w-3xl">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">账户设置</h1>
        <p className="text-sm text-muted-foreground mt-1">
          完善昵称、头像与外部平台账号,便于运营在审核时识别。
        </p>
      </header>

      <Card className="mb-6 p-5">
        <div className="flex items-center gap-4">
          <CreatorAvatar
            avatar={profile.avatarUrl}
            name={profile.nickname}
            className="size-14"
          />
          <div className="min-w-0">
            <div className="text-base font-semibold truncate">
              {profile.nickname}
            </div>
            <div className="text-xs text-muted-foreground">
              @{session.username}
              {user.email && ` · ${user.email}`}
            </div>
          </div>
        </div>
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="text-sm font-medium mb-4">编辑资料</h2>
        <AccountForm initial={profile} />
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-medium mb-1">账户安全</h2>
        <p className="text-xs text-muted-foreground mb-4">
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
