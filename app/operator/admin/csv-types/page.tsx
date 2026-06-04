/**
 * 管理员 · csvType 管理列表
 *
 * csvType 元数据是 Job 产物清单里 csvType 下拉的数据源,以及
 * 产物筛选 UI 用来推断"可选列名 + 操作符"的依据。
 */
import Link from "next/link";
import { Plus, Database } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import type { ColumnDef } from "@/lib/validation/csv-type";

export default async function AdminCsvTypesPage() {
  await requireRole("ADMIN");

  const items = await prisma.csvType.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      label: true,
      description: true,
      columns: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { username: true } },
    },
  });

  // 引用计数:Job.outputs JSON 里包含 csvType=<name> 的 Job 数。
  // 用一条 SQL 拿一个 Map,避免 N+1。
  const refCounts = new Map<string, number>();
  if (items.length > 0) {
    // Postgres JSON 查询:把 outputs 拆开,统计每个 csvType 的出现 Job 数。
    type CountRow = { csv_type: string; job_count: number };
    const rows = await prisma.$queryRawUnsafe<CountRow[]>(`
      SELECT
        (output ->> 'csvType')::text AS csv_type,
        COUNT(DISTINCT j.id)::int AS job_count
      FROM "CrawlerJob" j,
           jsonb_array_elements(j.outputs) AS output
      WHERE output ->> 'csvType' IS NOT NULL
      GROUP BY (output ->> 'csvType')
    `);
    for (const r of rows) refCounts.set(r.csv_type, Number(r.job_count));
  }

  return (
    <div className="p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">csvType 管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            csvType = 一份 CSV/Excel 表的"种类标签",决定产物落到哪个 raw 目录、能跑哪个 parser、UI 上有哪些可筛选列。
            新增直接点右上按钮,也可上传一份样本表自动抽列。
          </p>
        </div>
        <Button asChild>
          <Link href="/operator/admin/csv-types/new">
            <Plus className="size-4" />
            新建 csvType
          </Link>
        </Button>
      </header>

      {items.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          <Database className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3">还没有 csvType。点右上「新建 csvType」开始。</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr className="h-10">
                <th className="px-4 text-left font-medium">name(程序 key)</th>
                <th className="px-4 text-left font-medium">label(显示名)</th>
                <th className="px-4 text-center font-medium">列数</th>
                <th className="px-4 text-center font-medium">Job 引用</th>
                <th className="px-4 text-center font-medium">最近更新</th>
                <th className="px-4 text-center font-medium">创建</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((c) => {
                const columns = (c.columns as unknown as ColumnDef[]) ?? [];
                const refs = refCounts.get(c.name) ?? 0;
                return (
                  <tr key={c.id} className="h-[60px] transition-colors hover:bg-muted/40">
                    <td className="px-4 align-middle">
                      <Link
                        href={`/operator/admin/csv-types/${c.id}`}
                        className="block truncate font-mono text-xs font-medium hover:text-primary"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 align-middle">
                      <div className="truncate">{c.label}</div>
                      {c.description && (
                        <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                          {c.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 text-center align-middle tabular-nums">
                      {columns.length}
                    </td>
                    <td className="px-4 text-center align-middle tabular-nums">
                      {refs}
                    </td>
                    <td className="px-4 text-center align-middle text-[11px] text-muted-foreground tabular-nums">
                      {fmtDateTime(c.updatedAt)}
                    </td>
                    <td className="px-4 text-center align-middle text-[11px] text-muted-foreground">
                      <div>{c.createdBy?.username ?? "—"}</div>
                      <div className="tabular-nums">{fmtDateTime(c.createdAt)}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
