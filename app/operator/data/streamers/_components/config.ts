/**
 * 主播数据表的常量与类型 —— 服务端 page.tsx 与客户端 StreamersDataTable 共享。
 * 独立成非 "use client" 模块,避免 RSC 边界错误。
 *
 * 数据来源:
 *   - 名单(身份 / 花名册字段)= 运营导入 AnchorStat(为主)/ 未来爬虫;
 *     保证「本月没发作品的主播也在名单内」。
 *   - 数值指标(粉丝量之后)= 按 UID 聚合明细表:
 *       · 作品数 / 作品播放量 / 作品推荐播放量 / 涨粉 ← 视频明细 VideoStat(hidden=false)
 *       · 粉丝量 ← 名单自带(导入)或后续直播明细覆盖
 *       · 直播天数 / ACU / 直播时长 / 曝光 / 进直播间 / 人均观看时长 ← 直播明细 LiveStat
 */

// 排序字段:名单列(joinedAt / fans / updatedAt)+ 视频聚合列(works* / fansGained)+ 直播聚合列
export const ALLOWED_SORT_BY = [
  "worksViews",
  "worksRecommendedViews",
  "worksCount",
  "fansGained",
  "fans",
  "joinedAt",
  "updatedAt",
  "anchorDays",
  "liveDuration",
  "acu",
  "exposureUsers",
  "enterRoomUsers",
] as const;
export type SortField = (typeof ALLOWED_SORT_BY)[number];
export const DEFAULT_SORT_BY: SortField = "worksViews";

export const PAGE_SIZE_OPTIONS = [10, 30, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 30;

/** 顶部统计卡片数据(受当前筛选影响) */
export type AnchorStats = {
  anchorCount: number;      // 名单主播数(去重后的花名册规模)
  totalWorks: number;       // 总作品数
  totalViews: number;       // 总作品播放量
  totalRecommended: number; // 总作品推荐播放量
};

/**
 * 一行 = 一个主播(来自 AnchorStat 名单,平台 + UID 唯一)。
 * 身份字段来自导入;数值字段按 UID 聚合明细表得到(无作品的主播为 0)。
 */
export type AnchorRow = {
  id: string;
  platform: string;
  uid: string;
  nickname: string | null;
  account: string | null;
  joinedAt: string | null;       // 入会时间
  groupNo: string | null;
  operatorAgent: string | null;
  recruitAgent: string | null;
  fans: number;                  // 粉丝量(名单自带 / 直播明细)
  worksCount: number;            // 作品数(聚合 VideoStat)
  worksViews: number;            // 作品播放量
  worksRecommendedViews: number; // 作品推荐播放量
  fansGained: number;            // 涨粉(视频维度累计)
  // 直播维度(聚合 LiveStat;率/均值按开播天数平均)
  anchorDays: number;            // 直播天数(=开播天数)
  liveDuration: number;          // 直播时长(小时,SUM)
  acu: number;                   // ACU(开播天数均值)
  exposureUsers: number;         // 曝光人数(SUM)
  exposureCount: number;         // 曝光次数(SUM)
  enterRoomUsers: number;        // 进直播间人数(SUM)
  enterRoomCount: number;        // 进直播间次数(SUM)
  avgWatchDuration: number;      // 人均观看时长(分钟,开播天数均值)
  updatedAt: string;             // 名单最近更新时间
};
