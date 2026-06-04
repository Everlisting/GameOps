import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requireRole } from "@/lib/rbac";

import CsvTypeForm, { EMPTY_INITIAL } from "../_components/CsvTypeForm";

export default async function NewCsvTypePage() {
  await requireRole("ADMIN");

  return (
    <div className="p-8">
      <div className="mb-4">
        <Link
          href="/operator/admin/csv-types"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          返回 csvType 列表
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-lg font-semibold">新建 csvType</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          手动配列定义,或者上传一份样本 CSV/Excel 自动抽列(类型按前 50 行推断)。
        </p>
      </header>

      <CsvTypeForm mode="create" initial={EMPTY_INITIAL} />
    </div>
  );
}
