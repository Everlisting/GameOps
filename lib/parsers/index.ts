/**
 * CSV parser 注册表。
 *
 * 新增 csvType 时:
 *   1. 在 lib/parsers/<name>.ts 写一个 Parser
 *   2. 在 KNOWN_CSV_TYPES(lib/validation/crawler.ts)登记 + 标签
 *   3. 在这里 import + 挂进 PARSERS 表
 */
import type { Parser } from "./types";
import { parseDouyinVideoDetail } from "./douyin-video-detail";
import { parseAnchorRoster } from "./anchor-roster";
import { parseLiveDetail } from "./live-detail";
import { snapshotVideoStatsForDataset } from "./snapshot";

export const PARSERS: Record<string, Parser> = {
  douyin_video_detail: parseDouyinVideoDetail,
  // 主播名单(花名册):按 (platform, uid) upsert 到 AnchorStat;无每日快照
  anchor_roster: parseAnchorRoster,
  // 直播明细(主播×日):按 (platform, uid, date) upsert 到 LiveStat;无每日快照
  live_detail: parseLiveDetail,
};

/**
 * 写时聚合器:parse 成功后跑一次,把 Detail 行落到对应每日汇总表。
 *   - 同 csvType 的快照逻辑放一处,parser 不感知
 *   - 返回写入的快照行数(供观测,不强制使用)
 *   - 找不到 snapshotter 视为该 csvType 不参与每日汇总
 */
export type Snapshotter = (datasetId: string) => Promise<number>;

export const SNAPSHOTTERS: Record<string, Snapshotter> = {
  douyin_video_detail: snapshotVideoStatsForDataset,
};

/** 拿不到时返回 null,调用方自行决定跳过还是报错 */
export function getParser(csvType: string): Parser | null {
  return PARSERS[csvType] ?? null;
}

export function getSnapshotter(csvType: string): Snapshotter | null {
  return SNAPSHOTTERS[csvType] ?? null;
}

export type { Parser, ParserContext, ParserResult } from "./types";
