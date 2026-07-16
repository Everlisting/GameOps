/**
 * 视频数据表的常量与类型 —— 服务端 page.tsx 与客户端 VideosDataTable 共享。
 * 独立成非 "use client" 模块,避免 RSC 边界错误(客户端模块的运行时值不能在服务端调用)。
 */
export const ALLOWED_SORT_BY = [
  "updatedAt",
  "publishedAt",
  "views",
  "recommendedViews",
  "likes",
  "comments",
  "shares",
  "fansGained",
] as const;
export type SortField = (typeof ALLOWED_SORT_BY)[number];

export const PAGE_SIZE_OPTIONS = [10, 30, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 30;

/** 删除/隐藏筛选:active=仅正常(默认) / hidden=仅删除隐藏 / all=全部 */
export const STATUS_FILTERS = ["active", "hidden", "all"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const DEFAULT_STATUS: StatusFilter = "active";

export function clampStatus(raw: string | undefined): StatusFilter {
  return (STATUS_FILTERS as readonly string[]).includes(raw ?? "")
    ? (raw as StatusFilter)
    : DEFAULT_STATUS;
}

/** 顶部统计卡片数据(受当前筛选影响) */
export type VideoStats = {
  totalRows: number;      // 作品条数
  distinctCreators: number; // 作品人数(去重 creatorUid,不计 null)
  sumViews: number;       // 总播放量
  sumRecommended: number; // 总推荐播放量
};

export type VideoRow = {
  id: string;
  platform: string;
  externalId: string;
  url: string;
  title: string;
  publishedAt: string | null;
  hidden: boolean;
  hiddenAt: string | null;
  creatorUid: string | null;
  creatorName: string | null;
  creatorAccount: string | null;
  views: number;
  recommendedViews: number;
  likes: number;
  comments: number;
  shares: number;
  fansGained: number;
  operatorAgent: string | null;
  recruitAgent: string | null;
  note: string | null;
  updatedAt: string;
  creator: { id: string; nickname: string } | null;
};
