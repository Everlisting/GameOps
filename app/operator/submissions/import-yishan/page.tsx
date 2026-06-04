/**
 * 运营端 · 稿件管理 · 导入易闪审核结果
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/rbac";
import YishanImportForm from "./_components/YishanImportForm";

export default async function YishanImportPage() {
  await requireRole("OPERATOR");
  return (
    <div className="p-8">
      <div className="mb-4">
        <Link
          href="/operator/submissions"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          返回稿件列表
        </Link>
      </div>
      <header className="mb-6">
        <h1 className="text-lg font-semibold">导入易闪审核结果</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          按 (平台, 稿件 ID) 匹配既有稿件,upsert 易闪审核状态并重算最终态。
          未匹配的行会列在导入结果中供运营复核。
        </p>
      </header>
      <YishanImportForm />
    </div>
  );
}
