/**
 * Server-side 助手:直接调 lib/opinion/client 拉初始列表 + 计数 + 读设置。
 * 拉不到(分析服务未起)时降级返回空数据,不打断页面渲染。
 */
import "server-only";

import {
  getTaskCounts,
  listTasks,
  type AnalysisTaskCounts,
  type AnalysisTaskInfo,
} from "@/lib/opinion/client";
import { readPublicSettings, type OpinionSettingsPublic } from "@/lib/opinion/settings";

export interface OpinionListPageData {
  items: AnalysisTaskInfo[];
  total: number;
  counts: AnalysisTaskCounts;
  configured: boolean;
  serviceReachable: boolean;
  settings: OpinionSettingsPublic;
}

const EMPTY_COUNTS: AnalysisTaskCounts = {
  total: 0, pending: 0, running: 0, done: 0, failed: 0,
};

export async function loadListPageData(
  scope: "private" | "public" | "combined",
  opts: { limit: number; offset: number } = { limit: 200, offset: 0 },
): Promise<OpinionListPageData> {
  const settings = await readPublicSettings();
  try {
    const [list, counts] = await Promise.all([
      listTasks({ scope, limit: opts.limit, offset: opts.offset }),
      getTaskCounts(scope),
    ]);
    return {
      items: list.items,
      total: list.total,
      counts,
      configured: settings.configured,
      serviceReachable: true,
      settings,
    };
  } catch (err) {
    console.warn(`[opinion.loader] listTasks(${scope}) 失败:`, err);
    return {
      items: [],
      total: 0,
      counts: EMPTY_COUNTS,
      configured: settings.configured,
      serviceReachable: false,
      settings,
    };
  }
}
