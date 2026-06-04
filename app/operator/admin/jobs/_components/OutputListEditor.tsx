"use client";

/**
 * 产物清单编辑器:每行 = 一个产物声明。
 *
 * 字段:
 *   - path: 相对 workdir 的文件路径,支持 glob
 *   - csvType?: 可选;空 = 留底不入解析
 *   - optional?: 文件 / glob 无匹配时是否容错
 *   - filterRoot?: 行级筛选树,支持 AND/OR 嵌套(顶层默认 AND,最深 3 层)
 */
import * as React from "react";
import { Trash2, Plus, FilterIcon, FolderPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OPERATORS_BY_TYPE,
  OPERATOR_LABEL,
  operatorNeedsValue,
  type FilterOperator,
} from "@/lib/parsers/columns";
import type { ColumnDef } from "@/lib/validation/csv-type";
import type { CsvTypeOption } from "@/lib/csv-types";

// ── 数据形状(与服务端 Zod 对齐) ──────────────────

export type FilterLeaf = {
  column: string;
  operator: FilterOperator;
  value?: string | number;
};

export type FilterGroup = {
  combinator: "AND" | "OR";
  items: FilterNode[];
};

export type FilterNode = FilterLeaf | FilterGroup;

function isGroup(n: FilterNode): n is FilterGroup {
  return (n as FilterGroup).combinator !== undefined;
}

export type OutputItem = {
  path: string;
  csvType?: string;
  optional?: boolean;
  filterRoot?: FilterGroup;
};

// ── 顶层编辑器 ──────────────────────────────────

const NO_CSV = "__none";
const MAX_DEPTH = 3;

export default function OutputListEditor({
  value,
  onChange,
  csvTypes,
}: {
  value: OutputItem[];
  onChange: (next: OutputItem[]) => void;
  /** 全部可用 csvType + 列定义(由 JobForm 从 server props 传入) */
  csvTypes: CsvTypeOption[];
}) {
  const csvTypeByName = React.useMemo(
    () => new Map(csvTypes.map((c) => [c.name, c])),
    [csvTypes],
  );
  function update(i: number, patch: Partial<OutputItem>) {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...value, { path: "" }]);
  }

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          没有产物声明;Job 仅靠脚本自己发飞书,不入库
        </p>
      )}
      {value.map((item, i) => {
        const columns = item.csvType
          ? (csvTypeByName.get(item.csvType)?.columns ?? null)
          : null;
        return (
          <Card key={i} className="p-3">
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-7">
                <Label className="text-[11px]">产物路径 *(相对 workdir)</Label>
                <Input
                  value={item.path}
                  onChange={(e) => update(i, { path: e.target.value })}
                  placeholder="output/video_detail.csv"
                  className="font-mono text-xs"
                />
              </div>
              <div className="col-span-4">
                <Label className="text-[11px]">csvType(空 = 不入库)</Label>
                <Select
                  value={item.csvType ?? NO_CSV}
                  onValueChange={(v) =>
                    update(i, {
                      csvType: v === NO_CSV ? undefined : v,
                      // 切 csvType 列时清掉旧 filter(列名可能不匹配新类型)
                      filterRoot: undefined,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CSV}>不入库</SelectItem>
                    {csvTypes.map((t) => (
                      <SelectItem key={t.name} value={t.name}>
                        {t.label} ({t.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 flex items-end justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(i)}
                  title="删除产物"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="col-span-12 flex items-center gap-1.5 text-xs">
                <input
                  id={`output-optional-${i}`}
                  type="checkbox"
                  checked={item.optional ?? false}
                  onChange={(e) =>
                    update(i, { optional: e.target.checked || undefined })
                  }
                />
                <label htmlFor={`output-optional-${i}`} className="cursor-pointer">
                  可选(文件 / glob 无匹配时不报错)
                </label>
              </div>

              {/* 筛选树编辑器:csvType 注册了列元数据时显示 */}
              {item.csvType && (
                <div className="col-span-12 mt-1">
                  {!columns ? (
                    <p className="rounded-md border border-border bg-muted/20 p-2 text-[11px] text-muted-foreground">
                      该 csvType 尚未注册列元数据,无法配置筛选(产物仍可上传留底)。
                      要支持筛选,先在 <code className="font-mono">lib/parsers/columns.ts</code> 登记列。
                    </p>
                  ) : (
                    <FilterTreeEditor
                      columns={columns}
                      root={item.filterRoot}
                      onChange={(next) => update(i, { filterRoot: next })}
                    />
                  )}
                </div>
              )}
            </div>
          </Card>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="size-3.5" />
        添加产物
      </Button>
    </div>
  );
}

// ── 筛选树:顶层壳 + 递归 FilterGroupEditor ────────

function FilterTreeEditor({
  columns,
  root,
  onChange,
}: {
  columns: ColumnDef[];
  root: FilterGroup | undefined;
  onChange: (next: FilterGroup | undefined) => void;
}) {
  const enabled = root !== undefined;
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2">
      <div className="mb-2 flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium">
          <FilterIcon className="size-3.5 text-muted-foreground" />
          行级筛选(嵌套 AND / OR;不配 = 全量入库)
        </div>
        {enabled ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(undefined)}
          >
            <Trash2 className="size-3" />
            清空筛选
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({ combinator: "AND", items: [] })}
          >
            <Plus className="size-3" />
            启用筛选
          </Button>
        )}
      </div>
      {enabled && (
        <FilterGroupEditor
          group={root}
          columns={columns}
          onChange={onChange}
          depth={0}
        />
      )}
    </div>
  );
}

function FilterGroupEditor({
  group,
  columns,
  onChange,
  depth,
}: {
  group: FilterGroup;
  columns: ColumnDef[];
  onChange: (next: FilterGroup) => void;
  depth: number;
}) {
  function updateItem(i: number, next: FilterNode) {
    const items = group.items.slice();
    items[i] = next;
    onChange({ ...group, items });
  }
  function removeItem(i: number) {
    onChange({ ...group, items: group.items.filter((_, idx) => idx !== i) });
  }
  function addLeaf() {
    const first = columns[0];
    const op = OPERATORS_BY_TYPE[first.type][0];
    const leaf: FilterLeaf = { column: first.name, operator: op };
    onChange({ ...group, items: [...group.items, leaf] });
  }
  function addSubGroup() {
    if (depth >= MAX_DEPTH - 1) return;
    // 子组默认用与父组相反的 combinator,常见嵌套场景就是 AND 里嵌 OR
    const sub: FilterGroup = {
      combinator: group.combinator === "AND" ? "OR" : "AND",
      items: [],
    };
    onChange({ ...group, items: [...group.items, sub] });
  }

  const canAddSubGroup = depth < MAX_DEPTH - 1;

  return (
    <div
      className={
        depth === 0
          ? ""
          : "rounded-md border-l-2 border-primary/30 bg-background/60 pl-2"
      }
    >
      {/* combinator + 操作按钮 */}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Select
          value={group.combinator}
          onValueChange={(v) =>
            onChange({ ...group, combinator: v as "AND" | "OR" })
          }
        >
          <SelectTrigger className="h-7 w-[100px] text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">AND(全部满足)</SelectItem>
            <SelectItem value="OR">OR(任一满足)</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={addLeaf}>
          <Plus className="size-3" />
          添加条件
        </Button>
        {canAddSubGroup && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSubGroup}
          >
            <FolderPlus className="size-3" />
            添加子组
          </Button>
        )}
        <span className="text-[10px] text-muted-foreground">
          {group.items.length} 项
          {!canAddSubGroup && depth > 0 && " · 已达最深"}
        </span>
      </div>

      {/* 子项 */}
      {group.items.length === 0 ? (
        <p className="py-1 text-[11px] text-muted-foreground">
          空组(等同不过滤)。点上方按钮加条件或子组。
        </p>
      ) : (
        <div className="space-y-1.5">
          {group.items.map((it, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 rounded border border-border bg-background p-1.5"
            >
              <div className="min-w-0 flex-1">
                {isGroup(it) ? (
                  <FilterGroupEditor
                    group={it}
                    columns={columns}
                    onChange={(next) => updateItem(i, next)}
                    depth={depth + 1}
                  />
                ) : (
                  <FilterLeafEditor
                    leaf={it}
                    columns={columns}
                    onChange={(next) => updateItem(i, next)}
                  />
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={() => removeItem(i)}
                title={isGroup(it) ? "删除子组" : "删除条件"}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterLeafEditor({
  leaf,
  columns,
  onChange,
}: {
  leaf: FilterLeaf;
  columns: ColumnDef[];
  onChange: (next: FilterLeaf) => void;
}) {
  const colDef = columns.find((c) => c.name === leaf.column) ?? columns[0];
  const availableOps = OPERATORS_BY_TYPE[colDef.type];
  const needsValue = operatorNeedsValue(leaf.operator);

  return (
    <div className="grid grid-cols-12 items-center gap-1.5">
      <div className="col-span-5">
        <Select
          value={leaf.column}
          onValueChange={(v) => {
            const newCol = columns.find((c) => c.name === v) ?? columns[0];
            const ops = OPERATORS_BY_TYPE[newCol.type];
            onChange({
              column: v,
              operator: ops.includes(leaf.operator) ? leaf.operator : ops[0],
              value: undefined,
            });
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {columns.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                {c.label ?? c.name}
                <span className="ml-1 text-[10px] text-muted-foreground">
                  ({c.type})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-3">
        <Select
          value={leaf.operator}
          onValueChange={(v) =>
            onChange({
              ...leaf,
              operator: v as FilterOperator,
              value: operatorNeedsValue(v as FilterOperator) ? leaf.value : undefined,
            })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableOps.map((op) => (
              <SelectItem key={op} value={op}>
                {OPERATOR_LABEL[op]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-4">
        {needsValue ? (
          <Input
            className="h-8 text-xs"
            type={colDef.type === "number" ? "number" : "text"}
            value={leaf.value === undefined ? "" : String(leaf.value)}
            placeholder={colDef.type === "date" ? "2026-06-01" : "值"}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onChange({ ...leaf, value: undefined });
              } else if (colDef.type === "number") {
                const n = Number(raw);
                onChange({ ...leaf, value: Number.isNaN(n) ? undefined : n });
              } else {
                onChange({ ...leaf, value: raw });
              }
            }}
          />
        ) : (
          <span className="text-[11px] text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}
