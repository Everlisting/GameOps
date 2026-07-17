"use client";

/**
 * 直播数据 · TanStack Table 客户端组件
 *
 * 服务端已按 sortBy/order/page/pageSize 出结果,客户端负责:
 *  - 表头点击 → 更新 URL(?sortBy=&order=)
 *  - 分页 / 每页 → 更新 URL
 *  - 搜索 / 团号 debounce 300ms → 更新 URL
 *  - 日期范围 → 更新 URL
 *  - 列显隐(纯客户端 state)
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Eye,
  Radio,
  Search,
  Timer,
  Users,
  X,
} from "lucide-react";

import DateRangeField from "@/app/operator/_components/DateRangeField";

import { TruncatedName } from "@/components/truncated-name";
import { WanNumber } from "@/components/wan-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDate } from "@/lib/format";

import {
  PAGE_SIZE_OPTIONS,
  type LiveRow,
  type LiveStats,
  type SortField,
} from "./config";

type Props = {
  items: LiveRow[];
  total: number;
  stats: LiveStats;
  page: number;
  pageSize: number;
  sortBy: SortField;
  order: "asc" | "desc";
  q: string;
  groupNo: string;
  dateFrom: string;
  dateTo: string;
  defaultMonth: string | null;
};

const NUM_FMT = new Intl.NumberFormat("en-US");
function fmtNum(n: number) {
  return NUM_FMT.format(n);
}
function fmtFloat(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function DashIfEmpty({ value }: { value: string | null | undefined }) {
  return value && value.trim() ? (
    <>{value}</>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

export default function LiveDataTable({
  items,
  total,
  stats,
  page,
  pageSize,
  sortBy,
  order,
  q,
  groupNo,
  dateFrom,
  dateTo,
  defaultMonth,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const pushQuery = React.useCallback(
    (patch: Record<string, string | number | null>) => {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") sp.delete(k);
        else sp.set(k, String(v));
      }
      const qs = sp.toString();
      router.push(qs ? `?${qs}` : "?");
    },
    [router, searchParams],
  );

  // ---------- 搜索 ----------
  const [qDraft, setQDraft] = React.useState(q);
  React.useEffect(() => setQDraft(q), [q]);
  React.useEffect(() => {
    if (qDraft === q) return;
    const t = setTimeout(() => pushQuery({ q: qDraft || null, page: null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft]);

  // ---------- 团号 ----------
  const [groupNoDraft, setGroupNoDraft] = React.useState(groupNo);
  React.useEffect(() => setGroupNoDraft(groupNo), [groupNo]);
  React.useEffect(() => {
    if (groupNoDraft === groupNo) return;
    const t = setTimeout(() => pushQuery({ groupNo: groupNoDraft || null, page: null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupNoDraft]);

  // ---------- 排序 ↔ URL ----------
  const sorting: SortingState = React.useMemo(
    () => [{ id: sortBy, desc: order === "desc" }],
    [sortBy, order],
  );
  const onSortingChange = React.useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const s = next[0];
      if (!s) {
        pushQuery({ sortBy: null, order: null, page: null });
        return;
      }
      pushQuery({ sortBy: s.id, order: s.desc ? "desc" : "asc", page: null });
    },
    [pushQuery, sorting],
  );

  // ---------- 列显隐 ----------
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({
    soundWave: false,
    exposureCount: false,
    enterRoomCount: false,
    enterRoomRate: false,
    tipUsers: false,
    tipCount: false,
    operatorAgent: false,
    recruitAgent: false,
  });

  const columns = React.useMemo<ColumnDef<LiveRow>[]>(
    () => [
      {
        accessorKey: "platform",
        header: "平台",
        size: 74,
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.original.platform}
          </Badge>
        ),
      },
      {
        accessorKey: "uid",
        header: "UID",
        size: 155,
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.uid}</span>,
      },
      {
        accessorKey: "nickname",
        header: "主播昵称",
        size: 120,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.nickname ? (
            <TruncatedName value={row.original.nickname} className="text-xs font-medium" />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "account",
        header: "抖音号",
        size: 130,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            <DashIfEmpty value={row.original.account} />
          </span>
        ),
      },
      {
        accessorKey: "date",
        header: "日期",
        size: 110,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-[11px] text-muted-foreground">{fmtDate(row.original.date)}</span>
        ),
      },
      numericColumn("soundWave", "音浪", { size: 90 }),
      numericColumn("liveDuration", "开播时长", { float: true, size: 80 }),
      numericColumn("acu", "ACU", { float: true, size: 80 }),
      numericColumn("exposureUsers", "曝光人数", { wan: true, size: 100 }),
      numericColumn("exposureCount", "曝光次数", { wan: true, size: 100 }),
      numericColumn("enterRoomUsers", "进直播间人数", { wan: true, size: 100 }),
      numericColumn("enterRoomCount", "进直播间次数", { wan: true, size: 100 }),
      numericColumn("enterRoomRate", "进直播间转化率", { float: true, suffix: "%", sortable: false, size: 120 }),
      numericColumn("avgWatchDuration", "人均观看时长", { float: true, size: 100 }),
      numericColumn("tipUsers", "打赏人数", { sortable: false, size: 80 }),
      numericColumn("tipCount", "打赏次数", { sortable: false, size: 80 }),
      numericColumn("newFans", "新增粉丝", { sortable: false, size: 80 }),
      {
        accessorKey: "note",
        header: "团号",
        size: 80,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs">
            <DashIfEmpty value={row.original.note} />
          </span>
        ),
      },
      {
        accessorKey: "operatorAgent",
        header: "运营经纪人",
        size: 120,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs">
            <DashIfEmpty value={row.original.operatorAgent} />
          </span>
        ),
      },
      {
        accessorKey: "recruitAgent",
        header: "招募经纪人",
        size: 120,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs">
            <DashIfEmpty value={row.original.recruitAgent} />
          </span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: items,
    columns,
    // 固定列宽:table-fixed 下按 size 定宽,排序/翻页换数据时列宽不再跳动
    defaultColumn: { size: 100 },
    state: { sorting, columnVisibility },
    onSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    enableSortingRemoval: true,
  });

  return (
    <div className="flex min-h-0 flex-1 min-w-0 max-w-full flex-col gap-3">
      {/* 顶部统计卡片 */}
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard
          label="记录数"
          value={fmtNum(stats.recordCount)}
          icon={<CalendarDays className="size-4 text-muted-foreground" />}
          hint="主播天次"
        />
        <StatCard
          label="涉及主播数"
          value={fmtNum(stats.anchorCount)}
          icon={<Users className="size-4 text-muted-foreground" />}
          hint="按 UID 去重"
        />
        <StatCard
          label="总开播时长"
          value={`${fmtFloat(stats.totalDuration)} h`}
          icon={<Timer className="size-4 text-muted-foreground" />}
        />
        <StatCard
          label="总曝光人数"
          value={fmtNum(stats.totalExposure)}
          icon={<Eye className="size-4 text-muted-foreground" />}
        />
      </div>

      {/* 筛选栏 */}
      <Card className="shrink-0 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative w-220">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder="UID / 主播昵称 / 抖音号"
              className="pl-9 pr-9"
            />
            {qDraft && <InlineClearButton onClear={() => setQDraft("")} />}
          </div>
          <div className="relative w-40">
            <Input
              value={groupNoDraft}
              onChange={(e) => setGroupNoDraft(e.target.value)}
              placeholder="按团号筛选"
              className="pr-9"
            />
            {groupNoDraft && <InlineClearButton onClear={() => setGroupNoDraft("")} />}
          </div>
          <DateRangeField
            from={dateFrom}
            to={dateTo}
            clearable
            width="w-64"
            onChange={(f, t) =>
              pushQuery({ dateFrom: f || null, dateTo: t || null, page: null })
            }
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 className="size-3.5" />
                列显隐
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-48 overflow-y-auto">
              <DropdownMenuLabel className="text-xs">显示列</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllLeafColumns()
                .filter((c) => c.getCanHide())
                .map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={col.getIsVisible()}
                    onCheckedChange={(v) => col.toggleVisibility(!!v)}
                    onSelect={(e) => e.preventDefault()}
                    className="text-xs"
                  >
                    {columnLabel(col.id)}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          第 {page} / {totalPages} 页
          {q ? ` · 命中 "${q}"` : ""}
          <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground/80">
            <Radio className="size-3" />
            {defaultMonth
              ? `默认仅显示本月(${defaultMonth}),往月请用「日期」筛选`
              : "仅收录开播时长>0 的记录"}
          </span>
        </p>
      </Card>

      {/* 表格 */}
      {items.length === 0 ? (
        <Card className="shrink-0 border-dashed p-10 text-center text-sm text-muted-foreground">
          {q
            ? `没有匹配 "${q}" 的直播记录。`
            : defaultMonth
              ? `本月(${defaultMonth})暂无直播记录。往月请用「日期」筛选,或点右上角「导入」上传直播明细。`
              : "暂无数据。点右上角「导入」上传直播明细表。"}
        </Card>
      ) : (
        <Card className="min-h-0 min-w-0 max-w-full flex-1 overflow-hidden p-0">
          <Table
            containerClassName="h-full"
            className="table-fixed"
            style={{ width: table.getTotalSize(), minWidth: "100%" }}
          >
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((h) => {
                    const canSort = h.column.getCanSort();
                    const sortDir = h.column.getIsSorted();
                    return (
                      <TableHead
                        key={h.id}
                        className="sticky top-0 z-20 whitespace-nowrap bg-muted text-center align-middle"
                        style={{ width: h.getSize() }}
                      >
                        {canSort ? (
                          <button
                            type="button"
                            onClick={h.column.getToggleSortingHandler()}
                            className="mx-auto inline-flex items-center gap-1 hover:text-foreground"
                          >
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            <SortIcon dir={sortDir} />
                          </button>
                        ) : (
                          flexRender(h.column.columnDef.header, h.getContext())
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="overflow-hidden whitespace-nowrap text-center align-middle"
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* 底栏 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          每页
          <Select
            value={String(pageSize)}
            onValueChange={(v) => pushQuery({ pageSize: Number(v), page: null })}
          >
            <SelectTrigger size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          条
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => pushQuery({ page: page - 1 })}
          >
            <ChevronLeft className="size-3.5" />
            上一页
          </Button>
          <span className="text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => pushQuery({ page: page + 1 })}
          >
            下一页
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function numericColumn(
  id: SortField | "exposureCount" | "enterRoomCount" | "enterRoomRate" | "tipUsers" | "tipCount",
  label: string,
  opts: { float?: boolean; suffix?: string; sortable?: boolean; wan?: boolean; size?: number } = {},
): ColumnDef<LiveRow> {
  const { float = false, suffix = "", sortable = true, wan = false } = opts;
  return {
    accessorKey: id,
    header: label,
    size: opts.size,
    enableSorting: sortable,
    cell: ({ row }) => {
      const v = row.original[id as keyof LiveRow] as number;
      if (wan) return <span className="text-xs"><WanNumber value={v} /></span>;
      return (
        <span className="text-xs tabular-nums">
          {float ? fmtFloat(v) : fmtNum(v)}
          {suffix}
        </span>
      );
    },
  };
}

function InlineClearButton({ onClear }: { onClear: () => void }) {
  return (
    <button
      type="button"
      aria-label="清除"
      onClick={onClear}
      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
    >
      <X className="size-4" />
    </button>
  );
}

function StatCard({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card className="px-4 py-2.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground/70">· {hint}</span>}
      </div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

function SortIcon({ dir }: { dir: false | "asc" | "desc" }) {
  if (dir === "asc") return <ArrowUp className="size-3" />;
  if (dir === "desc") return <ArrowDown className="size-3" />;
  return <ArrowUpDown className="size-3 text-muted-foreground/60" />;
}

const COLUMN_LABELS: Record<string, string> = {
  platform: "平台",
  uid: "UID",
  nickname: "主播昵称",
  account: "抖音号",
  date: "日期",
  soundWave: "音浪",
  liveDuration: "开播时长",
  acu: "ACU",
  exposureUsers: "曝光人数",
  exposureCount: "曝光次数",
  enterRoomUsers: "进直播间人数",
  enterRoomCount: "进直播间次数",
  enterRoomRate: "进直播间转化率",
  avgWatchDuration: "人均观看时长",
  tipUsers: "打赏人数",
  tipCount: "打赏次数",
  newFans: "新增粉丝",
  note: "团号",
  operatorAgent: "运营经纪人",
  recruitAgent: "招募经纪人",
};
function columnLabel(id: string) {
  return COLUMN_LABELS[id] ?? id;
}
