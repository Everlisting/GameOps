/**
 * 运营/管理员 · 采集数据 · 列表
 * 展示最近 200 个 RawDataset:csvType、行数、解析状态、下载链接、来源 task。
 */
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { Database, Download } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CSV_TYPE_LABEL } from "@/lib/validation/crawler";

export default async function OperatorDatasetsPage({
  searchParams,
}: {
  searchParams?: { csvType?: string };
}) {
  await requireRole("OPERATOR");

  const csvType = searchParams?.csvType?.trim() || undefined;
  const where: Prisma.RawDatasetWhereInput = {};
  if (csvType) where.csvType = csvType;

  const items = await prisma.rawDataset.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      csvType: true,
      fileName: true,
      fileSize: true,
      rowCount: true,
      parsedAt: true,
      parseError: true,
      contentHash: true,
      createdAt: true,
      task: {
        select: {
          id: true,
          sequenceNumber: true,
          status: true,
          job: { select: { id: true, name: true } },
          createdBy: { select: { username: true } },
        },
      },
    },
  });

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">采集数据</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          agent 上传的原始 CSV,留底 + 审计 + 重跑解析用。下载需要登录。
        </p>
      </header>

      <Card className="mb-5 p-4">
        <p className="text-xs text-muted-foreground">
          共 {items.length} 条
          {items.length >= 200 ? "(仅展示最近 200 条)" : ""}
        </p>
      </Card>

      {items.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          <Database className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3">还没有采集数据。等爬虫机上传后会显示在这里。</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 font-medium">数据集</th>
                <th className="px-3 py-2.5 font-medium">来源任务</th>
                <th className="px-3 py-2.5 font-medium">解析</th>
                <th className="px-3 py-2.5 font-medium text-right">大小 / 行数</th>
                <th className="px-3 py-2.5 font-medium">上传时间</th>
                <th className="px-3 py-2.5 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((d) => (
                <tr key={d.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-3 py-2.5 align-top">
                    <div className="truncate text-xs font-medium">
                      {d.fileName ?? <span className="text-muted-foreground">(无文件名)</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {d.csvType
                        ? (CSV_TYPE_LABEL[d.csvType] ?? d.csvType)
                        : <span className="italic">未分类</span>}
                      <span className="ml-1 font-mono opacity-60">· {d.id}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs">
                    {d.task ? (
                      d.task.job ? (
                        <Link
                          href={`/operator/tasks/${d.task.job.id}/runs/${d.task.id}`}
                          className="hover:text-primary"
                        >
                          {d.task.job.name}
                          {d.task.sequenceNumber ? ` #${d.task.sequenceNumber}` : ""}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          任务 {d.task.id.slice(0, 8)}(Job 已删)
                        </span>
                      )
                    ) : (
                      <span className="text-muted-foreground">已解绑</span>
                    )}
                    {d.task?.createdBy && (
                      <div className="text-[10px] text-muted-foreground">
                        {d.task.createdBy.username}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    {d.parsedAt ? (
                      <Badge variant="success">已解析</Badge>
                    ) : d.parseError ? (
                      <div>
                        <Badge variant="destructive">失败</Badge>
                        <div className="mt-1 line-clamp-2 text-[10px] text-destructive">
                          {d.parseError}
                        </div>
                      </div>
                    ) : d.csvType ? (
                      <Badge variant="muted">未解析</Badge>
                    ) : (
                      <Badge variant="outline">仅留底</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top text-right text-xs tabular-nums">
                    <div>{formatBytes(d.fileSize)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {d.rowCount ?? "—"} 行
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top text-[11px] text-muted-foreground">
                    {fmtDateTime(d.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 align-top text-right">
                    <Button asChild size="sm" variant="outline">
                      <a href={`/api/operator/datasets/${d.id}/download`}>
                        <Download className="size-3.5" />
                        下载
                      </a>
                    </Button>
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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
