/**
 * CSV parser 注册表的通用类型。
 *
 * 每种 csvType 一个 parser:
 *   - 输入:已读到内存的 CSV 字符串 + 来源 dataset id
 *   - 输出:实际写入明细层的行数(rowCount)
 *   - 抛错时由调用方记入 RawDataset.parseError;任务本身不会因 parse 失败回滚
 */
import type { FilterNode } from "./csv-helpers";

export type ParserContext = {
  /** 触发本次 parse 的 RawDataset.id;parser 写明细层时通常落到 lastDatasetId */
  datasetId: string;
  /** 本次 task 的 paramValues 快照;parser 可按需读取。
   *  cron 自动触发 / 历史数据时为空对象;parser 应做防御。 */
  paramValues: Record<string, unknown>;
  /** 本次解析的行级筛选树(从 Job.outputs[*].filterRoot 取);
   *  parser 在每行映射前调用 applyFilterTree(row, ctx.filterRoot)。
   *  null / undefined 表示不过滤。 */
  filterRoot: FilterNode | null;
};

export type ParserResult = {
  rowCount: number;
  /** 本次导入判定为「达人删除/隐藏」的行数(全表比对,缺失即标记);无此语义的 parser 可不返回。 */
  hiddenCount?: number;
  /** 本次导入按规则跳过、未入库的行数(如直播明细「开播时长≤0」的空行);无此语义的 parser 可不返回。 */
  skippedCount?: number;
};

export type Parser = (csv: string, ctx: ParserContext) => Promise<ParserResult>;
