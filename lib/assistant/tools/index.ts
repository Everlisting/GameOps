/**
 * 阶段10.2 · AI 助手 · 工具集(RBAC 绑定)。
 *
 * 目前 5 个只读数据工具均为 OPERATOR 可用(路由已 requireRole(OPERATOR) 兜底)。
 * 未来的写工具 / audit_search(ADMIN)等再按 session.role 收窄。
 */
import type { SessionPayload } from "@/lib/session";

import { TOOL_DEFS } from "@/lib/assistant/tools/schemas";
import {
  streamerProfileTool,
  videoSummaryTool,
  crawlerTaskStatusTool,
} from "@/lib/assistant/tools/data";
import { activitySummaryTool, incentiveExplainTool } from "@/lib/assistant/tools/activity";

// session 暂未用于收窄(全部 OPERATOR 只读);保留形参以便后续加 ADMIN/写工具时按角色过滤。
export function makeTools(_session: SessionPayload) {
  return {
    [TOOL_DEFS.streamerProfile.name]: streamerProfileTool(),
    [TOOL_DEFS.videoSummary.name]: videoSummaryTool(),
    [TOOL_DEFS.activitySummary.name]: activitySummaryTool(),
    [TOOL_DEFS.incentiveExplain.name]: incentiveExplainTool(),
    [TOOL_DEFS.crawlerTaskStatus.name]: crawlerTaskStatusTool(),
  };
}
