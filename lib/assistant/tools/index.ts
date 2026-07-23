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
import { knowledgeSearchTool } from "@/lib/assistant/tools/knowledge";

// 数据工具全 OPERATOR 只读;knowledge_search 按 session.role 收窄可见知识库(per-KB 权限)。
export function makeTools(session: SessionPayload) {
  return {
    [TOOL_DEFS.streamerProfile.name]: streamerProfileTool(),
    [TOOL_DEFS.videoSummary.name]: videoSummaryTool(),
    [TOOL_DEFS.activitySummary.name]: activitySummaryTool(),
    [TOOL_DEFS.incentiveExplain.name]: incentiveExplainTool(),
    [TOOL_DEFS.crawlerTaskStatus.name]: crawlerTaskStatusTool(),
    [TOOL_DEFS.knowledgeSearch.name]: knowledgeSearchTool(session),
  };
}
