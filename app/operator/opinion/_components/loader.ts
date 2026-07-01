/**
 * Server-side 助手:直接调 lib/opinion/client 拉初始列表 + 读设置。
 * 拉不到(分析服务未起)时降级返回空列表,不打断页面渲染。
 */
import "server-only";

import { listTasks, type AnalysisTaskInfo } from "@/lib/opinion/client";
import { readPublicSettings, type OpinionSettingsPublic } from "@/lib/opinion/settings";

export interface OpinionListPageData {
  items: AnalysisTaskInfo[];
  total: number;
  configured: boolean;
  serviceReachable: boolean;
  settings: OpinionSettingsPublic;
}

export async function loadListPageData(
  scope: "private" | "public" | "combined",
  opts: { limit: number; offset: number } = { limit: 200, offset: 0 },
): Promise<OpinionListPageData> {
  const settings = await readPublicSettings();
  try {
    const list = await listTasks({ scope, limit: opts.limit, offset: opts.offset });
    return {
      items: list.items,
      total: list.total,
      configured: settings.configured,
      serviceReachable: true,
      settings,
    };
  } catch (err) {
    console.warn(`[opinion.loader] listTasks(${scope}) 失败:`, err);
    return {
      items: [],
      total: 0,
      configured: settings.configured,
      serviceReachable: false,
      settings,
    };
  }
}
