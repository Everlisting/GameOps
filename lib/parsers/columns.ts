/**
 * 每个 csvType 的列定义元数据。
 *
 * 用途:
 *   - Job 编辑 UI 用来生成"产物筛选"区的列下拉
 *   - Server 端校验 Filter 时知道列存在 + 列类型
 *   - Parser 应用 Filter 时按列类型解释值
 *
 * 新增 csvType 解析器时,同时在这里加一份列定义。
 *   - name:必须与 CSV 表头一致(parser 按 name 取值)
 *   - label:可选;UI 显示用,不填则用 name
 *   - type:控制 UI 输入控件 + 可用操作符
 *     · string:INCLUDES / EQUALS / NOT_EQUALS / NOT_EMPTY / EMPTY
 *     · number:EQUALS / NOT_EQUALS / GTE / LTE / GT / LT / NOT_EMPTY / EMPTY
 *     · date:  EQUALS / GTE / LTE / NOT_EMPTY / EMPTY
 *     · url:   NOT_EMPTY / EMPTY / INCLUDES
 */

export type ColumnType = "string" | "number" | "date" | "url";

export type ColumnDef = {
  name: string;
  label?: string;
  type: ColumnType;
};

export const CSV_TYPE_COLUMNS: Record<string, ColumnDef[]> = {
  douyin_video_detail: [
    { name: "UID", type: "string" },
    { name: "主播名称", type: "string" },
    { name: "主播账号", type: "string" },
    { name: "视频链接", type: "url" },
    { name: "视频标题", type: "string" },
    { name: "发布时间", type: "date" },
    { name: "播放量", type: "number" },
    { name: "推荐播放量", type: "number" },
    { name: "点赞量", type: "number" },
    { name: "评论量", type: "number" },
    { name: "分享量", type: "number" },
    { name: "涨粉量", type: "number" },
    { name: "运营经纪人", type: "string" },
    { name: "招募经纪人", type: "string" },
    { name: "备注", type: "string" },
  ],
};

/** 返回某 csvType 的列定义;未注册返回 null。 */
export function getColumnsFor(csvType: string | null | undefined): ColumnDef[] | null {
  if (!csvType) return null;
  return CSV_TYPE_COLUMNS[csvType] ?? null;
}

/** Filter 操作符全集 */
export type FilterOperator =
  | "INCLUDES"
  | "NOT_INCLUDES"
  | "EQUALS"
  | "NOT_EQUALS"
  | "NOT_EMPTY"
  | "EMPTY"
  | "GTE"
  | "LTE"
  | "GT"
  | "LT";

/** 按列类型给出可用操作符 + UI 显示标签 */
export const OPERATORS_BY_TYPE: Record<ColumnType, FilterOperator[]> = {
  string: ["INCLUDES", "NOT_INCLUDES", "EQUALS", "NOT_EQUALS", "NOT_EMPTY", "EMPTY"],
  number: ["EQUALS", "NOT_EQUALS", "GTE", "LTE", "GT", "LT", "NOT_EMPTY", "EMPTY"],
  date: ["EQUALS", "GTE", "LTE", "NOT_EMPTY", "EMPTY"],
  url: ["NOT_EMPTY", "EMPTY", "INCLUDES"],
};

/** 操作符的中文标签(UI 下拉用) */
export const OPERATOR_LABEL: Record<FilterOperator, string> = {
  INCLUDES: "包含",
  NOT_INCLUDES: "不包含",
  EQUALS: "等于",
  NOT_EQUALS: "不等于",
  NOT_EMPTY: "不为空",
  EMPTY: "为空",
  GTE: "≥",
  LTE: "≤",
  GT: ">",
  LT: "<",
};

/** 操作符是否需要 value(NOT_EMPTY / EMPTY 不需要) */
export function operatorNeedsValue(op: FilterOperator): boolean {
  return op !== "NOT_EMPTY" && op !== "EMPTY";
}
