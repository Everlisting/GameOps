import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/rbac";

import { FeishuReportConfigPanel } from "./_components/FeishuReportConfigPanel";

export default async function FeishuReportConfigPage() {
  await requireRole("ADMIN");

  return (
    <div className="p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">运营数据日报配置</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              编辑飞书日报的标题、内容模块和卡片主题，并查看基于当前数据生成的最终发送内容。
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/operator/admin/feishu">
              <ArrowLeft data-icon="inline-start" />
              返回飞书集成
            </Link>
          </Button>
        </header>

        <FeishuReportConfigPanel />
      </div>
    </div>
  );
}
