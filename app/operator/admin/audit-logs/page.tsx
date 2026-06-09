/**
 * 管理员 · 审计日志查看
 *
 * 表内只读列出 AuditLog,按 createdAt desc。
 * 筛选(URL 同步):操作人(actorUsername 模糊) / 动作 / 目标类型 / 时间段。
 * 分页 page/pageSize,任意筛选变更回到 page=1。
 * 详情列点开 Dialog 显示完整 details JSON。
 *
 * 入口仅 ADMIN(layout 已校验,这里再 requireRole 保险)。
 */
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { SYSTEM_ACTOR_USERNAME } from "@/lib/audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import AuditFilters from "./_components/AuditFilters";
import AuditDetailsButton, {
  type AuditRow,
} from "./_components/AuditDetailsButton";
import PageSizeSelect from "./_components/PageSizeSelect";
import { describeAction, TARGET_TYPE_LABEL } from "./labels";

const DEFAULT_PAGE_SIZE = 50;
/** 翻页面尺寸白名单,与 PageSizeSelect 的下拉项保持一致 */
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
/** 数据范围硬底:只查近 N 天的审计记录,超出范围不展示 */
const LOOKBACK_DAYS = 60;
const DAY_MS = 86_400_000;

function clampPage(raw: string | undefined, fallback = 1): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function clampPageSize(raw: string | undefined): number {
  const n = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
    ? n
    : DEFAULT_PAGE_SIZE;
}

/**
 * 把 DateTimePickerField 产出的 "YYYY-MM-DDTHH:mm" 显式当作 Asia/Shanghai(+08:00),
 * 避免 server 端 TZ=UTC 把"北京 10:00"误读成"UTC 10:00"。
 */
function parseShanghai(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    action?: string;
    targetType?: string;
    from?: string;
    to?: string;
    page?: string;
    pageSize?: string;
  };
}) {
  await requireRole("ADMIN");

  const q = searchParams?.q?.trim() || "";
  const action = searchParams?.action?.trim() || "";
  const targetType = searchParams?.targetType?.trim() || "";
  const userFrom = parseShanghai(searchParams?.from);
  const toDate = parseShanghai(searchParams?.to);
  const page = clampPage(searchParams?.page, 1);
  const pageSize = clampPageSize(searchParams?.pageSize);

  // 数据范围硬底:始终把 createdAt 卡在近 N 天内;
  // 用户填的 from 只能在这个窗口里再往内收窄,不能再往前翻。
  const lookbackFloor = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS);
  const effectiveFrom =
    userFrom && userFrom.getTime() > lookbackFloor.getTime()
      ? userFrom
      : lookbackFloor;

  const where: Prisma.AuditLogWhereInput = {
    createdAt: {
      gte: effectiveFrom,
      ...(toDate ? { lte: toDate } : {}),
    },
  };
  if (q) where.actorUsername = { contains: q, mode: "insensitive" };
  if (action) where.action = action;
  if (targetType) where.targetType = targetType;

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        actorId: true,
        actorUsername: true,
        action: true,
        targetType: true,
        targetId: true,
        details: true,
        createdAt: true,
      },
    }),
  ]);

  const rows: AuditRow[] = items.map((i) => ({
    id: i.id,
    time: fmtDateTime(i.createdAt),
    actorUsername: i.actorUsername,
    isSystem:
      i.actorUsername === SYSTEM_ACTOR_USERNAME || i.actorId == null,
    action: i.action,
    targetType: i.targetType,
    targetId: i.targetId,
    details: i.details,
  }));

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">审计日志</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          所有运营 / 管理员动作的留底,仅显示近 {LOOKBACK_DAYS} 天内。
          系统(cron)触发的动作显示为「系统」。
        </p>
      </header>

      <Card className="mb-5 p-4">
        <AuditFilters />
        <p className="mt-3 text-xs text-muted-foreground">
          共 {total.toLocaleString()} 条 · 当前页 {page} / {totalPages}
        </p>
      </Card>

      {rows.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          没有符合条件的审计记录。
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[12%]" />
              <col className="w-[22%]" />
              <col className="w-[31%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr className="h-10">
                <th className="px-4 text-left font-medium">时间</th>
                <th className="px-4 text-left font-medium">操作人</th>
                <th className="px-4 text-left font-medium">动作</th>
                <th className="px-4 text-left font-medium">目标</th>
                <th className="px-4 text-center font-medium">命名空间</th>
                <th className="px-4 text-center font-medium">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const a = describeAction(r.action);
                const targetLabel =
                  TARGET_TYPE_LABEL[r.targetType] ?? r.targetType;
                return (
                  <tr
                    key={r.id}
                    className="h-12 transition-colors hover:bg-muted/40"
                  >
                    <td className="px-4 align-middle font-mono text-xs tabular-nums text-muted-foreground">
                      {r.time}
                    </td>
                    <td className="px-4 align-middle">
                      {r.isSystem ? (
                        <Badge variant="muted">系统</Badge>
                      ) : (
                        <span className="truncate">{r.actorUsername}</span>
                      )}
                    </td>
                    <td className="px-4 align-middle">
                      <div className="truncate">{a.label}</div>
                      <div className="truncate font-mono text-[10px] text-muted-foreground">
                        {r.action}
                      </div>
                    </td>
                    <td className="px-4 align-middle">
                      <div className="truncate">{targetLabel}</div>
                      {r.targetId && (
                        <div className="truncate font-mono text-[10px] text-muted-foreground">
                          {r.targetId}
                        </div>
                      )}
                    </td>
                    <td className="px-4 text-center align-middle">
                      <Badge variant="muted" className="text-[10px]">
                        {a.namespace}
                      </Badge>
                    </td>
                    <td className="px-4 text-center align-middle">
                      <AuditDetailsButton row={r} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {rows.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <PageSizeSelect pageSize={pageSize} />
          {totalPages > 1 ? (
            <Pager
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              searchParams={searchParams ?? {}}
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              共 {total.toLocaleString()} 条
            </span>
          )}
        </div>
      )}
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
    for (const k of ["q", "action", "targetType", "from", "to"] as const) {
      const v = searchParams[k];
      if (v) sp.set(k, v);
    }
    if (p !== 1) sp.set("page", String(p));
    if (pageSize !== DEFAULT_PAGE_SIZE) sp.set("pageSize", String(pageSize));
    const qs = sp.toString();
    return qs ? `/operator/admin/audit-logs?${qs}` : "/operator/admin/audit-logs";
  }

  return (
    <div className="flex items-center gap-2">
      {page > 1 ? (
        <Button asChild size="sm" variant="outline">
          <Link href={buildHref(page - 1)}>
            <ChevronLeft className="size-3.5" />
            上一页
          </Link>
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled>
          <ChevronLeft className="size-3.5" />
          上一页
        </Button>
      )}
      <span className="text-xs text-muted-foreground">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Button asChild size="sm" variant="outline">
          <Link href={buildHref(page + 1)}>
            下一页
            <ChevronRight className="size-3.5" />
          </Link>
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled>
          下一页
          <ChevronRight className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
