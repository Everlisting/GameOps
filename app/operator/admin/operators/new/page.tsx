/**
 * 管理员 · 运营账户管理 · 新建
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import OperatorUserCreateForm from "../_components/OperatorUserCreateForm";

export default function NewOperatorUserPage() {
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
      <header className="mb-6">
        <h1 className="text-lg font-semibold">新建运营 / 管理员账户</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          创建后立即可登录使用,无需再走审核。
        </p>
      </header>
      <OperatorUserCreateForm />
    </div>
  );
}
