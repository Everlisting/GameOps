/**
 * 共享给所有 CSV parser 的小工具。
 *
 * 当前内容:
 *   - Filter 树(AND / OR 嵌套)应用
 *
 * 添加新 parser 时,优先复用这里的工具;新逻辑超过 1 处用到就抽过来。
 */

import type { FilterOperator } from "./columns";

/** 叶子 filter:对单列做判断。 */
export type FilterLeaf = {
  column: string;
  operator: FilterOperator;
  value?: string | number;
};

/** 组合 filter:子项之间 AND / OR 组合,子项可以是叶子也可以是另一个组。 */
export type FilterGroup = {
  combinator: "AND" | "OR";
  items: FilterNode[];
};

export type FilterNode = FilterLeaf | FilterGroup;

function isGroup(node: FilterNode): node is FilterGroup {
  return (node as FilterGroup).combinator !== undefined;
}

/** 对单条 leaf 计算:row 是"列名 → 字符串"map(CSV 原始值,trim 留给这里)。 */
function evalLeaf(row: Record<string, string>, f: FilterLeaf): boolean {
  const raw = row[f.column] ?? "";
  const cell = raw.trim();

  switch (f.operator) {
    case "NOT_EMPTY":
      return cell.length > 0;
    case "EMPTY":
      return cell.length === 0;
    case "INCLUDES":
      return typeof f.value === "string" && cell.includes(f.value);
    case "NOT_INCLUDES":
      return typeof f.value === "string" && !cell.includes(f.value);
    case "EQUALS":
      return cell === String(f.value ?? "");
    case "NOT_EQUALS":
      return cell !== String(f.value ?? "");
    case "GTE":
    case "LTE":
    case "GT":
    case "LT": {
      const cellNum = Number(cell);
      const valNum = typeof f.value === "number" ? f.value : Number(f.value);
      if (!Number.isFinite(cellNum) || !Number.isFinite(valNum)) return false;
      if (f.operator === "GTE") return cellNum >= valNum;
      if (f.operator === "LTE") return cellNum <= valNum;
      if (f.operator === "GT") return cellNum > valNum;
      return cellNum < valNum;
    }
    default:
      return true; // 未知 operator 视为通过(防御,理论上 Zod 已挡)
  }
}

/**
 * 递归求值:
 *   - 叶子直接 evalLeaf
 *   - 组按 combinator 聚合
 *     · 空组(items=[]) → true(空组不过滤)
 *     · AND:每一项都为 true 才 true(短路)
 *     · OR :至少一项为 true 即 true(短路)
 */
export function evalFilterNode(
  row: Record<string, string>,
  node: FilterNode,
): boolean {
  if (!isGroup(node)) return evalLeaf(row, node);
  if (node.items.length === 0) return true;
  if (node.combinator === "AND") {
    return node.items.every((it) => evalFilterNode(row, it));
  }
  return node.items.some((it) => evalFilterNode(row, it));
}

/**
 * 顶层入口:根据 filterRoot 判断一行是否入库。
 * root 未传 / null / undefined → 不过滤,全量入库。
 */
export function applyFilterTree(
  row: Record<string, string>,
  root: FilterNode | null | undefined,
): boolean {
  if (!root) return true;
  return evalFilterNode(row, root);
}
