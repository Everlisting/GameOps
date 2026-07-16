/**
 * 直播数据表的常量与类型 —— 服务端 page.tsx 与客户端 LiveDataTable 共享。
 * 独立成非 "use client" 模块,避免 RSC 边界错误。
 *
 * 数据源:LiveStat(直播明细,主播 × 自然日,导入 / 爬虫按 (platform,uid,date) upsert)。
 * 只承载「开播时长>0」的记录。默认视图仅显示本月(按日期),往月用日期筛选。
 */
export const ALLOWED_SORT_BY = [
  "date",
  "liveDuration",
  "acu",
  "soundWave",
  "exposureUsers",
  "exposureCount",
  "enterRoomUsers",
  "enterRoomCount",
  "avgWatchDuration",
  "newFans",
] as const;
export type SortField = (typeof ALLOWED_SORT_BY)[number];
export const DEFAULT_SORT_BY: SortField = "date";

export const PAGE_SIZE_OPTIONS = [10, 30, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 30;

/** 顶部统计卡片数据(受当前筛选影响) */
export type LiveStats = {
  recordCount: number;   // 记录数(主播天次)
  anchorCount: number;   // 涉及主播数(去重 UID)
  totalDuration: number; // 总开播时长(小时)
  totalExposure: number; // 总曝光人数
};

export type LiveRow = {
  id: string;
  platform: string;
  uid: string;
  date: string;
  nickname: string | null;
  account: string | null;
  soundWave: number;
  liveDuration: number;
  exposureUsers: number;
  exposureCount: number;
  enterRoomUsers: number;
  enterRoomCount: number;
  enterRoomRate: number;
  avgWatchDuration: number;
  tipUsers: number;
  tipCount: number;
  newFans: number;
  acu: number;
  note: string | null;
  operatorAgent: string | null;
  recruitAgent: string | null;
};
