/**
 * 运营/管理员 · 项目数据 · 主播数据(占位)
 * 尚未接入数据库,后续补主播明细模型再启用。
 */
import { Radio } from "lucide-react";

import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/rbac";

export default async function OperatorStreamerDataPage() {
  await requireRole("OPERATOR");

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">主播数据</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          主播明细数据看板,后续接入数据库后在此展示。
        </p>
      </header>

      <Card className="border-dashed p-12 text-center">
        <Radio className="mx-auto size-10 text-muted-foreground" />
        <h2 className="mt-4 text-sm font-medium">功能开发中</h2>
        <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
          主播维度的数据模型尚未建立,等到爬虫端产出主播明细 CSV 并落库后,
          这里会补上主播列表 / 播放趋势 / 榜单等视图。
        </p>
      </Card>
    </div>
  );
}
