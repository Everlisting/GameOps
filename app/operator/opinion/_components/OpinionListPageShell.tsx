"use client";

/**
 * 三个列表页共用外壳:标题 + 触发按钮 + 未配置提示 + 表格 + 分页。
 * 服务端负责首屏拉当前 page 的数据,client 拿到后交给 OpinionTaskTable 自轮询。
 */
import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import OpinionTaskTable, { type OpinionTaskItem } from "./OpinionTaskTable";
import { OpinionTriggerFileDialog } from "./OpinionTriggerFileDialog";
import { OpinionTriggerCombinedDialog } from "./OpinionTriggerCombinedDialog";
import OpinionPager from "./OpinionPager";
import OpinionPageSizeSelect from "./OpinionPageSizeSelect";
import OpinionStatsCards from "./OpinionStatsCards";
import type { AnalysisTaskCounts } from "@/lib/opinion/client";

const SCOPE_LABEL = {
  private: { title: "私域舆情", desc: "基于聊天记录导出的社群深度报告。" },
  public: { title: "公域舆情", desc: "抖音 / B 站 / 小红书 三平台评论合并后的深度报告。" },
  combined: { title: "对比报告", desc: "读取已完成的私域 + 公域固化 JSON,做叠加解读。" },
} as const;

export default function OpinionListPageShell({
  scope,
  initialItems,
  total,
  counts,
  page,
  pageSize,
  isAdmin,
  configured,
  onRefreshHref,
}: {
  scope: "private" | "public" | "combined";
  initialItems: OpinionTaskItem[];
  total: number;
  counts: AnalysisTaskCounts;
  page: number;
  pageSize: number;
  isAdmin: boolean;
  configured: boolean;
  onRefreshHref: string;
}) {
  const label = SCOPE_LABEL[scope];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{label.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{label.desc}</p>
        </div>
        {isAdmin && (
          <div className="shrink-0">
            {scope === "combined" ? (
              <OpinionTriggerCombinedDialog
                configured={configured}
                onCreated={() => window.location.assign(onRefreshHref)}
              />
            ) : (
              <OpinionTriggerFileDialog
                scope={scope}
                configured={configured}
                onCreated={() => window.location.assign(onRefreshHref)}
              />
            )}
          </div>
        )}
      </header>

      <OpinionStatsCards scope={scope} initialCounts={counts} />

      {isAdmin && !configured && (
        <Card className="mb-5 border-amber-400/50 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">LLM 未配置</p>
              <p className="mt-1 text-xs">
                需要先到「模型设置」填一份可用的 provider / model / apiKey,
                之后才能触发生成报告。
              </p>
              <Button asChild size="sm" variant="outline" className="mt-2 border-amber-400/50">
                <Link href="/operator/opinion/settings">去配置</Link>
              </Button>
            </div>
          </div>
        </Card>
      )}

      <OpinionTaskTable
        scope={scope}
        initialItems={initialItems}
        total={total}
        page={page}
        pageSize={pageSize}
        isAdmin={isAdmin}
      />

      {total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <OpinionPageSizeSelect pageSize={pageSize} />
          {totalPages > 1 ? (
            <OpinionPager page={page} totalPages={totalPages} />
          ) : (
            <span className="text-xs text-muted-foreground">共 {total} 条</span>
          )}
        </div>
      )}
    </div>
  );
}
