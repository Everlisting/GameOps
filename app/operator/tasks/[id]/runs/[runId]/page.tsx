/**
 * Job 单次执行详情(取代旧的 /operator/tasks/[taskId])
 *
 * URL:/operator/tasks/[id]/runs/[runId]   ([id] = jobId, [runId] = taskId)
 *
 * 元信息卡:启动人 / 参数值 / 起止时间 / 耗时 / 退出码 / 错误消息
 * 数据集卡:本次执行产生的 RawDataset 列表(可下载)
 * 操作:RUNNING/PENDING → "取消";SUCCEEDED/FAILED/CANCELED → "重跑"
 * 日志:默认折叠;展开后默认拉尾 100 行,可"加载更多"或"下载完整"
 */
import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";
import { notFound as nextNotFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { CSV_TYPE_LABEL } from "@/lib/validation/crawler";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import TaskStatusBadge from "../../../_components/TaskStatusBadge";
import RunActions from "./_components/RunActions";
import LogSection from "./_components/LogSection";

export default async function RunDetailPage({
  params,
}: {
  params: { id: string; runId: string };
}) {
  await requireRole("OPERATOR");
  const session = await getSession();

  const t = await prisma.crawlerTask.findUnique({
    where: { id: params.runId },
    include: {
      job: { select: { id: true, name: true } },
      agent: { select: { id: true, name: true } },
      createdBy: { select: { username: true } },
      datasets: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          csvType: true,
          fileName: true,
          fileSize: true,
          rowCount: true,
          parsedAt: true,
          parseError: true,
          createdAt: true,
        },
      },
    },
  });
  if (!t) nextNotFound();
  // URL 一致性:URL 里 [id] 必须等于 task.jobId(否则 404,防止脏链接绕过)
  if (t.jobId && t.jobId !== params.id) nextNotFound();

  const duration = computeDuration(t.startedAt, t.finishedAt);
  const hasLog = !!t.logPath;

  return (
    <div className="p-8">
      <div className="mb-4">
        <Link
          href={`/operator/tasks/${params.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          返回 {t.job?.name ?? "Job"}
        </Link>
      </div>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">
              {t.job?.name ?? "[已删 Job]"}
            </h1>
            <span className="text-base text-muted-foreground">
              #{t.sequenceNumber ?? "?"}
            </span>
            <TaskStatusBadge status={t.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-mono">{t.id}</span>
          </p>
        </div>
        <RunActions
          jobId={params.id}
          taskId={t.id}
          status={t.status}
          hasJob={!!t.jobId}
        />
      </header>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card className="space-y-2 p-5">
          <h2 className="text-sm font-medium">执行信息</h2>
          <KV label="启动人">
            {t.createdBy?.username ?? (
              <span className="text-muted-foreground">系统(cron)</span>
            )}
          </KV>
          <KV label="触发方式">
            {t.trigger === "AUTO" ? (
              <Badge variant="outline">自动</Badge>
            ) : (
              <Badge variant="secondary">手动</Badge>
            )}
          </KV>
          <KV label="爬虫机">
            {t.agent ? (
              <Link
                href={`/operator/admin/agents/${t.agent.id}`}
                className="hover:text-primary"
              >
                {t.agent.name}
              </Link>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </KV>
          <KV label="优先级">{t.priority}</KV>
          <KV label="开始时间">
            {t.startedAt ? fmtDateTime(t.startedAt) : "—"}
          </KV>
          <KV label="结束时间">
            {t.finishedAt ? fmtDateTime(t.finishedAt) : "—"}
          </KV>
          <KV label="耗时">{duration ?? "—"}</KV>
          <KV label="退出码">
            {t.exitCode != null ? (
              <span className="font-mono tabular-nums">{t.exitCode}</span>
            ) : (
              "—"
            )}
          </KV>
        </Card>

        <Card className="space-y-2 p-5">
          <h2 className="text-sm font-medium">参数值</h2>
          {Object.keys(t.paramValues ?? {}).length === 0 ? (
            <p className="text-xs text-muted-foreground">该执行无入参</p>
          ) : (
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
              {JSON.stringify(t.paramValues, null, 2)}
            </pre>
          )}
          {t.errorMessage && (
            <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              <div className="mb-1 font-medium">错误信息</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px]">
                {t.errorMessage}
              </pre>
            </div>
          )}
        </Card>

        <Card className="space-y-2 p-5 lg:col-span-2">
          <h2 className="text-sm font-medium">
            产物数据集({t.datasets.length})
          </h2>
          {t.datasets.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              暂无产物(任务未完成或脚本未产出)。
            </p>
          ) : (
            <div className="divide-y divide-border">
              {t.datasets.map((d) => (
                <div key={d.id} className="py-3 first:pt-0 last:pb-0">
                  {/* 第一行:文件名(脚本产出的原始文件名) */}
                  <div className="truncate font-mono text-xs font-medium">
                    {d.fileName ?? (
                      <span className="text-muted-foreground">
                        (无文件名)
                      </span>
                    )}
                  </div>
                  {/* 第二行:分类 + 状态徽章 + 行数 / 大小 */}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    {d.csvType ? (
                      <>
                        <span className="font-mono text-muted-foreground">
                          {d.csvType}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          ({CSV_TYPE_LABEL[d.csvType] ?? "未注册 parser"})
                        </span>
                      </>
                    ) : (
                      <span className="italic text-muted-foreground">未分类</span>
                    )}
                    {d.parsedAt ? (
                      <Badge variant="success">已解析</Badge>
                    ) : d.parseError ? (
                      <Badge variant="destructive">parse 失败</Badge>
                    ) : d.csvType ? (
                      <Badge variant="muted">未解析</Badge>
                    ) : (
                      <Badge variant="outline">仅留底</Badge>
                    )}
                    <span className="text-muted-foreground">
                      {d.rowCount ?? "—"} 行 · {formatBytes(d.fileSize)}
                    </span>
                  </div>
                  {d.parseError && (
                    <pre className="mt-1 whitespace-pre-wrap break-words rounded-md border border-destructive/30 bg-destructive/10 p-2 font-mono text-[11px] text-destructive">
                      {d.parseError}
                    </pre>
                  )}
                  <div className="mt-1.5">
                    <Button asChild size="sm" variant="outline">
                      <a href={`/api/operator/datasets/${d.id}/download`}>
                        <Download className="size-3.5" />
                        下载 CSV
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-2 p-5 lg:col-span-2">
          <LogSection
            taskId={t.id}
            initialStatus={t.status}
            hasLog={hasLog}
            isAdmin={session?.role === "ADMIN"}
          />
        </Card>
      </div>
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function computeDuration(start: Date | null, end: Date | null): string | null {
  if (!start) return null;
  const e = end ?? new Date();
  const ms = e.getTime() - start.getTime();
  if (ms < 0) return null;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600_000)
    return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3600_000)}h ${Math.floor((ms % 3600_000) / 60_000)}m`;
}
