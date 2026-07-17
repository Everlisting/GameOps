"use client";

/**
 * 视频数据 · TanStack Table 客户端组件
 *
 * 服务端已按 sortBy/order/page/pageSize 出结果,客户端只负责:
 *  - 表头点击 → 更新 URL(?sortBy=&order=)
 *  - 分页按钮 → 更新 URL(?page=&pageSize=)
 *  - 搜索栏 debounce 300ms → 更新 URL(?q=)
 *  - 列显隐(TanStack columnVisibility state,不入 URL)
 *
 * 服务端可排序字段(白名单):
 *   updatedAt / publishedAt / views / recommendedViews / likes / comments / shares / fansGained
 */
import * as React from "react";
import Link from "next/link";
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
  ChevronLeft,
  ChevronRight,
  Columns3,
  Eye,
  ExternalLink,
  Play,
  Search,
  ThumbsUp,
  Users,
  X,
} from "lucide-react";

import DateRangeField from "@/app/operator/_components/DateRangeField";
import VideoTrendDialog from "./VideoTrendDialog";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDateTime } from "@/lib/format";

import {
  DEFAULT_STATUS,
  PAGE_SIZE_OPTIONS,
  type SortField,
  type StatusFilter,
  type VideoRow,
  type VideoStats,
} from "./config";

type Props = {
  items: VideoRow[];
  total: number;
  stats: VideoStats;
  page: number;
  pageSize: number;
  sortBy: SortField;
  order: "asc" | "desc";
  q: string;
  groupNo: string;
  publishedFrom: string;
  publishedTo: string;
  status: StatusFilter;
  /** 非空(如 "2026-07")= 当前处于「本月发布」默认视图,用于文案提示 */
  defaultMonth: string | null;
};

const NUM_FMT = new Intl.NumberFormat("en-US");
function fmtNum(n: number) {
  return NUM_FMT.format(n);
}

function DashIfEmpty({ value }: { value: string | null | undefined }) {
  return value && value.trim() ? (
    <>{value}</>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

const EMPTY_STATS: VideoStats = {
  totalRows: 0,
  distinctCreators: 0,
  sumViews: 0,
  sumRecommended: 0,
};

export default function VideosDataTable({
  items,
  total,
  stats = EMPTY_STATS,
  page,
  pageSize,
  sortBy,
  order,
  q,
  groupNo,
  publishedFrom,
  publishedTo,
  status,
  defaultMonth,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 更新 URL:保留其它参数,只覆盖传入的 kv;null = 移除
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

  // ---------- 搜索栏(debounce 300ms) ----------
  const [qDraft, setQDraft] = React.useState(q);
  React.useEffect(() => {
    setQDraft(q);
  }, [q]);
  React.useEffect(() => {
    if (qDraft === q) return;
    const t = setTimeout(() => {
      pushQuery({ q: qDraft || null, page: null });
    }, 300);
    return () => clearTimeout(t);
    // 只监听 qDraft;q 是回填参考,pushQuery 已通过 useCallback 稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft]);

  // ---------- 团号筛选(debounce 300ms) ----------
  const [groupNoDraft, setGroupNoDraft] = React.useState(groupNo);
  React.useEffect(() => {
    setGroupNoDraft(groupNo);
  }, [groupNo]);
  React.useEffect(() => {
    if (groupNoDraft === groupNo) return;
    const t = setTimeout(() => {
      pushQuery({ groupNo: groupNoDraft || null, page: null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupNoDraft]);


  // ---------- TanStack sorting ↔ URL ----------
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
      pushQuery({
        sortBy: s.id,
        order: s.desc ? "desc" : "asc",
        page: null,
      });
    },
    [pushQuery, sorting],
  );

  // ---------- 列显隐(纯客户端 state) ----------
  // key = column id / accessorKey;false = 默认隐藏
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({
    likes: false,
    comments: false,
    shares: false,
    fansGained: false,
    operatorAgent: false,
    recruitAgent: false,
    updatedAt: false,
  });

  // 列顺序:平台 → 稿件ID → 稿件标题 → 发布时间 → 主播昵称 → UID → 抖音号
  //        → 播放量 → 推荐播放量 → 点赞 → 评论 → 分享 → 涨粉
  //        → 团号(note 字段,表头显示"团号") → 运营经纪人 → 招募经纪人 → 更新时间
  const columns = React.useMemo<ColumnDef<VideoRow>[]>(
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
        accessorKey: "hidden",
        header: "状态",
        size: 96,
        enableSorting: false,
        cell: ({ row }) => {
          if (!row.original.hidden) {
            return (
              <Badge
                variant="outline"
                className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300"
              >
                正常
              </Badge>
            );
          }
          const at = row.original.hiddenAt;
          return (
            <HoverCard>
              <HoverCardTrigger asChild>
                <Badge
                  variant="outline"
                  className="cursor-default border-muted-foreground/30 bg-muted text-[10px] text-muted-foreground"
                >
                  删除/隐藏
                </Badge>
              </HoverCardTrigger>
              <HoverCardContent align="center" side="top" className="w-auto max-w-[280px]">
                <p className="text-xs leading-relaxed">
                  达人已删除或隐藏该作品(某次导入中缺失判定)。
                  {at && (
                    <>
                      <br />
                      首次判定:{fmtDateTime(at)}
                    </>
                  )}
                  <br />
                  不参与任何统计 / 激励计算,仅留存展示。
                </p>
              </HoverCardContent>
            </HoverCard>
          );
        },
      },
      {
        id: "trend",
        header: "趋势",
        size: 60,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const r = row.original;
          // 已删除/隐藏的视频不提供趋势(不参与快照统计)
          if (r.hidden) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <VideoTrendDialog
              externalId={r.externalId}
              platform={r.platform}
              publishedAt={r.publishedAt}
            />
          );
        },
      },
      {
        accessorKey: "externalId",
        header: "稿件ID",
        size: 165,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.externalId}</span>
        ),
      },
      {
        accessorKey: "title",
        header: "稿件标题",
        size: 260,
        enableSorting: false,
        cell: ({ row }) => {
          const t = row.original.title;
          return (
            <div className="mx-auto flex max-w-[280px] items-center justify-center gap-1">
              {t ? (
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <span className="min-w-0 cursor-default truncate text-xs font-medium">
                      {t}
                    </span>
                  </HoverCardTrigger>
                  <HoverCardContent align="center" side="top" className="w-auto max-w-[420px]">
                    <p className="text-xs leading-relaxed break-words whitespace-pre-wrap select-text">
                      {t}
                    </p>
                  </HoverCardContent>
                </HoverCard>
              ) : (
                <span className="italic text-muted-foreground text-xs">(无标题)</span>
              )}
              {row.original.url && (
                <a
                  href={row.original.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shrink-0 text-muted-foreground hover:text-primary"
                  aria-label="打开原视频"
                >
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "publishedAt",
        header: "发布时间",
        size: 150,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-[11px] text-muted-foreground">
            {row.original.publishedAt ? fmtDateTime(row.original.publishedAt) : "—"}
          </span>
        ),
      },
      {
        id: "creator",
        header: "主播昵称",
        size: 120,
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          if (r.creator) {
            return (
              <Link
                href={`/operator/creators/${r.creator.id}`}
                className="text-xs font-medium hover:text-primary"
              >
                <TruncatedName value={r.creator.nickname} />
              </Link>
            );
          }
          return r.creatorName ? (
            <div className="flex flex-col items-center">
              <TruncatedName value={r.creatorName} className="text-xs" />
              <span className="text-[10px] text-muted-foreground">未匹配</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        accessorKey: "creatorUid",
        header: "UID",
        size: 155,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            <DashIfEmpty value={row.original.creatorUid} />
          </span>
        ),
      },
      {
        accessorKey: "creatorAccount",
        header: "抖音号",
        size: 130,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            <DashIfEmpty value={row.original.creatorAccount} />
          </span>
        ),
      },
      numericColumn("views", "播放量", { wan: true, size: 100 }),
      numericColumn("recommendedViews", "推荐播放量", { wan: true, size: 100 }),
      numericColumn("likes", "点赞",{ size: 100 }),
      numericColumn("comments", "评论",{ size: 90 }),
      numericColumn("shares", "分享",{ size: 80 }),
      numericColumn("fansGained", "涨粉",{ size: 80 }),
      {
        // 使用 note 字段,但表头显示为"团号"
        accessorKey: "note",
        header: "团号",
        size: 110,
        enableSorting: false,
        cell: ({ row }) => {
          const n = row.original.note;
          if (!n) return <span className="text-muted-foreground text-xs">—</span>;
          return (
            <HoverCard>
              <HoverCardTrigger asChild>
                <span className="mx-auto block max-w-[160px] cursor-default truncate text-xs">
                  {n}
                </span>
              </HoverCardTrigger>
              <HoverCardContent align="center" side="top" className="w-auto max-w-[360px]">
                <p className="text-xs leading-relaxed break-words whitespace-pre-wrap select-text">
                  {n}
                </p>
              </HoverCardContent>
            </HoverCard>
          );
        },
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
      {
        accessorKey: "updatedAt",
        header: "更新时间",
        size: 150,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-[11px] text-muted-foreground">
            {fmtDateTime(row.original.updatedAt)}
          </span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: items,
    columns,
    // 固定列宽:table-fixed 下按 size 定宽,排序/翻页换数据时列宽不再跳动。
    // 未显式 size 的列取此默认(数值列够用)。
    defaultColumn: { size: 110 },
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
      {/* 顶部统计卡片:作品条数 / 作品人数 / 总播放量 / 总推荐播放量 */}
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard
          label="作品条数"
          value={stats.totalRows}
          icon={<Play className="size-4 text-muted-foreground" />}
          hint="不含删除/隐藏"
        />
        <StatCard
          label="作品人数"
          value={stats.distinctCreators}
          icon={<Users className="size-4 text-muted-foreground" />}
          hint="按 UID 去重"
        />
        <StatCard
          label="总播放量"
          value={stats.sumViews}
          icon={<Eye className="size-4 text-muted-foreground" />}
        />
        <StatCard
          label="总推荐播放量"
          value={stats.sumRecommended}
          icon={<ThumbsUp className="size-4 text-muted-foreground" />}
        />
      </div>

      {/* 筛选栏:搜索 / 团号 / 发布日期范围 / 列显隐 */}
      <Card className="shrink-0 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative w-175">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder="视频ID / 视频标题 / UID / 抖音昵称 / 抖音号"
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
            from={publishedFrom}
            to={publishedTo}
            clearable
            width="w-64"
            placeholder="发布日期范围"
            onChange={(f, t) =>
              pushQuery({ publishedFrom: f || null, publishedTo: t || null, page: null })
            }
          />
          <div className="flex items-end gap-3">
            <div className="w-36">
              {/* <label className="mb-1 block text-xs text-muted-foreground">状态</label> */}
              <Select
                value={status}
                onValueChange={(v) =>
                  pushQuery({
                    status: v === DEFAULT_STATUS ? null : v,
                    page: null,
                  })
                }
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">正常</SelectItem>
                  <SelectItem value="hidden">已删除 / 隐藏</SelectItem>
                  <SelectItem value="all">全部</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Columns3 className="size-3.5" />
                  列显隐
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
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
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          共 {fmtNum(total)} 条 · 第 {page} / {totalPages} 页
          {q ? ` · 命中 "${q}"` : ""}
          {defaultMonth
            ? ` · 默认仅显示本月(${defaultMonth})发布 · 查看往月请用「发布日期」筛选`
            : ""}
        </p>
      </Card>

      {/* 表格 */}
      {items.length === 0 ? (
        <Card className="shrink-0 border-dashed p-10 text-center text-sm text-muted-foreground">
          {q
            ? `没有匹配 "${q}" 的视频。`
            : defaultMonth
              ? `本月(${defaultMonth})暂无发布的稿件。查看往月请用「发布日期」筛选。`
              : "暂无数据。"}
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
                      className="overflow-hidden text-center align-middle"
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

      {/* 底栏:pageSize + 分页 */}
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
  id: SortField,
  label: string,
  opts: { wan?: boolean; size?: number } = {},
): ColumnDef<VideoRow> {
  return {
    accessorKey: id,
    header: label,
    size: opts.size,
    enableSorting: true,
    cell: ({ row }) => {
      const v = row.original[id as keyof VideoRow] as number;
      return (
        <span className="text-xs">
          {opts.wan ? <WanNumber value={v} /> : <span className="tabular-nums">{fmtNum(v)}</span>}
        </span>
      );
    },
  };
}

/** 输入框右侧的灰色 × 清除按钮(用于 Input 内嵌);父容器需 relative */
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
  value: number;
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
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{fmtNum(value)}</div>
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
  externalId: "稿件ID",
  title: "稿件标题",
  publishedAt: "发布时间",
  hidden: "状态",
  creator: "主播昵称",
  creatorUid: "UID",
  creatorAccount: "抖音号",
  views: "播放量",
  recommendedViews: "推荐播放量",
  likes: "点赞",
  comments: "评论",
  shares: "分享",
  fansGained: "涨粉",
  note: "团号",
  operatorAgent: "运营经纪人",
  recruitAgent: "招募经纪人",
  updatedAt: "更新时间",
};
function columnLabel(id: string) {
  return COLUMN_LABELS[id] ?? id;
}
