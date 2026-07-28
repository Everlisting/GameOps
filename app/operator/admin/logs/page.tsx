/**
 * 管理员 · 运行错误(ErrorLog)查看 —— 日志系统阶段4。
 *
 * 只读列出高价值 error/fatal(sink 写入),按 occurredAt desc。
 * 筛选(URL 同步):level / module(模糊)/ requestId / traceId / taskId / fingerprint / 时间段。
 * 分页 page/pageSize;数据范围硬底近 90 天。仅 ADMIN;不提供未脱敏原始日志下载。
 *
 * 降级:未跑 migration/generate(errorLogDb 不可用)或表不存在时,展示提示而非崩溃。
 */
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { requireRole } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { errorLogDb } from "@/lib/logger/error-log-db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import LogFilters from "./_components/LogFilters";
import LogDetailButton, { LevelChip, type LogRow } from "./_components/LogDetailButton";
import PageSizeSelect from "./_components/PageSizeSelect";

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
const LOOKBACK_DAYS = 90;
const DAY_MS = 86_400_000;

function clampPage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
}
function clampPageSize(raw: string | undefined): number {
  const n = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}
function parseShanghai(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function AdminErrorLogsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  await requireRole("ADMIN");

  const enabled = process.env.LOG_ERROR_DB_ENABLED === "true";

  // 未生成 client / 未跑 migration:errorLogDb 不可用 → 提示,不崩
  if (!errorLogDb) {
    return (
      <Shell>
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          运行错误表尚未就绪。请停下 dev,执行 <code className="font-mono">pnpm db:migrate</code>{" "}
          生成 <code className="font-mono">error_log</code> 表并重新生成 Prisma client,
          再设 <code className="font-mono">LOG_ERROR_DB_ENABLED=true</code>。
        </Card>
      </Shell>
    );
  }

  const level = searchParams?.level?.trim() || "";
  const moduleQ = searchParams?.module?.trim() || "";
  const requestId = searchParams?.requestId?.trim() || "";
  const traceId = searchParams?.traceId?.trim() || "";
  const taskId = searchParams?.taskId?.trim() || "";
  const fingerprint = searchParams?.fingerprint?.trim() || "";
  const userFrom = parseShanghai(searchParams?.from);
  const toDate = parseShanghai(searchParams?.to);
  const page = clampPage(searchParams?.page);
  const pageSize = clampPageSize(searchParams?.pageSize);

  const lookbackFloor = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);
  const effectiveFrom =
    userFrom && userFrom.getTime() > lookbackFloor.getTime() ? userFrom : lookbackFloor;

  const where: Record<string, unknown> = {
    occurredAt: { gte: effectiveFrom, ...(toDate ? { lte: toDate } : {}) },
  };
  if (level) where.level = level;
  if (moduleQ) where.module = { contains: moduleQ, mode: "insensitive" };
  if (requestId) where.requestId = requestId;
  if (traceId) where.traceId = traceId;
  if (taskId) where.taskId = taskId;
  if (fingerprint) where.fingerprint = fingerprint;

  let total = 0;
  let items: Awaited<ReturnType<typeof errorLogDb.findMany>> = [];
  let tableMissing = false;
  try {
    [total, items] = await Promise.all([
      errorLogDb.count({ where }),
      errorLogDb.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
  } catch {
    tableMissing = true; // 表还没建(P2021 等)→ 空态提示
  }

  const rows: LogRow[] = items.map((i) => ({
    id: i.id,
    time: fmtDateTime(i.occurredAt),
    level: i.level,
    service: i.service,
    environment: i.environment,
    release: i.release,
    instanceId: i.instanceId,
    module: i.module,
    event: i.event,
    msg: i.msg,
    requestId: i.requestId,
    traceId: i.traceId,
    taskId: i.taskId,
    runId: i.runId,
    userIdHash: i.userIdHash,
    errName: i.errName,
    errMessage: i.errMessage,
    errStack: i.errStack,
    errCode: i.errCode,
    fingerprint: i.fingerprint,
    fields: i.fields,
  }));

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Shell enabled={enabled}>
      <Card className="mb-5 p-4">
        <LogFilters />
        <p className="mt-3 text-xs text-muted-foreground">
          共 {total.toLocaleString()} 条 · 当前页 {page} / {totalPages}
        </p>
      </Card>

      {rows.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          {tableMissing
            ? "error_log 表尚未创建,请先跑 migration。"
            : "没有符合条件的运行错误记录。"}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[7%]" />
              <col className="w-[16%]" />
              <col className="w-[33%]" />
              <col className="w-[20%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr className="h-10">
                <th className="px-4 text-left font-medium">时间</th>
                <th className="px-4 text-left font-medium">级别</th>
                <th className="px-4 text-left font-medium">模块 / 事件</th>
                <th className="px-4 text-left font-medium">消息</th>
                <th className="px-4 text-left font-medium">requestId</th>
                <th className="px-4 text-center font-medium">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="h-12 transition-colors hover:bg-muted/40">
                  <td className="px-4 align-middle font-mono text-xs tabular-nums text-muted-foreground">
                    {r.time}
                  </td>
                  <td className="px-4 align-middle">
                    <LevelChip level={r.level} />
                  </td>
                  <td className="px-4 align-middle">
                    <div className="truncate font-mono text-xs">{r.module}</div>
                    {r.event && (
                      <div className="truncate font-mono text-[10px] text-muted-foreground">
                        {r.event}
                      </div>
                    )}
                  </td>
                  <td className="px-4 align-middle">
                    <div className="truncate">{r.msg}</div>
                    {r.errMessage && r.errMessage !== r.msg && (
                      <div className="truncate text-[10px] text-muted-foreground">
                        {r.errName}: {r.errMessage}
                      </div>
                    )}
                  </td>
                  <td className="px-4 align-middle font-mono text-[10px] text-muted-foreground">
                    <div className="truncate">{r.requestId ?? "—"}</div>
                  </td>
                  <td className="px-4 text-center align-middle">
                    <LogDetailButton row={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {rows.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <PageSizeSelect pageSize={pageSize} />
          {totalPages > 1 ? (
            <Pager page={page} pageSize={pageSize} totalPages={totalPages} searchParams={searchParams ?? {}} />
          ) : (
            <span className="text-xs text-muted-foreground">共 {total.toLocaleString()} 条</span>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, enabled }: { children: React.ReactNode; enabled?: boolean }) {
  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">运行错误</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          高价值 error / fatal 留档,仅显示近 {LOOKBACK_DAYS} 天。链路查询看 SLS(见 docs/logging-deploy.md)。
        </p>
        {enabled === false && (
          <Badge variant="muted" className="mt-2">
            当前未开启写入(LOG_ERROR_DB_ENABLED=false),仅展示历史记录
          </Badge>
        )}
      </header>
      {children}
    </div>
  );
}

function Pager({
  page,
  pageSize,
  totalPages,
  searchParams,
}: {
  page: number;
  pageSize: number;
  totalPages: number;
  searchParams: Record<string, string | undefined>;
}) {
  function buildHref(p: number): string {
    const sp = new URLSearchParams();
    for (const k of ["level", "module", "requestId", "traceId", "taskId", "fingerprint", "from", "to"] as const) {
      const v = searchParams[k];
      if (v) sp.set(k, v);
    }
    if (p !== 1) sp.set("page", String(p));
    if (pageSize !== DEFAULT_PAGE_SIZE) sp.set("pageSize", String(pageSize));
    const qs = sp.toString();
    return qs ? `/operator/admin/logs?${qs}` : "/operator/admin/logs";
  }

  return (
    <div className="flex items-center gap-2">
      <Button asChild={page > 1} size="sm" variant="outline" disabled={page <= 1}>
        {page > 1 ? (
          <Link href={buildHref(page - 1)}>
            <ChevronLeft className="size-3.5" />
            上一页
          </Link>
        ) : (
          <span>
            <ChevronLeft className="size-3.5" />
            上一页
          </span>
        )}
      </Button>
      <span className="text-xs text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Button asChild={page < totalPages} size="sm" variant="outline" disabled={page >= totalPages}>
        {page < totalPages ? (
          <Link href={buildHref(page + 1)}>
            下一页
            <ChevronRight className="size-3.5" />
          </Link>
        ) : (
          <span>
            下一页
            <ChevronRight className="size-3.5" />
          </span>
        )}
      </Button>
    </div>
  );
}
