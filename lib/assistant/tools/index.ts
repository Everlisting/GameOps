/**
 * 阶段10.2 · AI 助手 · 工具集(RBAC 绑定)。
 *
 * 目前 5 个只读数据工具均为 OPERATOR 可用(路由已 requireRole(OPERATOR) 兜底)。
 * 未来的写工具 / audit_search(ADMIN)等再按 session.role 收窄。
 */
import type { Tool, ToolSet } from "ai";

import type { SessionPayload } from "@/lib/session";

import { TOOL_DEFS } from "@/lib/assistant/tools/schemas";
import {
  streamerProfileTool,
  videoSummaryTool,
  videoRankTool,
  crawlerTaskStatusTool,
} from "@/lib/assistant/tools/data";
import { activitySummaryTool, incentiveExplainTool } from "@/lib/assistant/tools/activity";
import { knowledgeSearchTool } from "@/lib/assistant/tools/knowledge";
import {
  incentiveComputeTool,
  crawlerTaskRerunTool,
  crawlerTaskCancelTool,
  activityStatusTool,
  activityUpdateTool,
  type ToolContext,
} from "@/lib/assistant/tools/approvals";

/** 写工具(需审批)名单:chat 路由据此做 stopWhen(调用即停)+ 剥离历史写工具交互。 */
export const WRITE_TOOL_NAMES: string[] = [
  TOOL_DEFS.incentiveCompute.name,
  TOOL_DEFS.crawlerTaskRerun.name,
  TOOL_DEFS.crawlerTaskCancel.name,
  TOOL_DEFS.activityStatus.name,
  TOOL_DEFS.activityUpdate.name,
];

/**
 * ai@7 的 `ModelMessage` 要求工具输出是纯 `JSONValue`;而 Prisma 返回的 `Date` / `Decimal`
 * (以及 raw SQL 的 bigint)不是,会让下一步 `standardizePrompt` 校验整条 prompt 失败
 * (报 "messages do not match the ModelMessage[] schema")。这里统一把每个工具的返回值过一遍
 * JSON 规整(Date→ISO 串、Decimal→串、丢 undefined),从根上消除该类隐患,新工具也自动受益。
 */
function jsonSafe(value: unknown): unknown {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

type LooseExecute = (input: unknown, options: unknown) => unknown;

function wrapJsonSafe(tools: ToolSet): ToolSet {
  const out: Record<string, Tool> = {};
  for (const [name, t] of Object.entries(tools)) {
    const exec = t.execute as LooseExecute | undefined;
    out[name] = exec
      ? ({
          ...t,
          execute: async (input: unknown, options: unknown) => jsonSafe(await exec(input, options)),
        } as Tool)
      : t;
  }
  return out;
}

// 数据工具全 OPERATOR 只读;knowledge_search 按 session.role 收窄可见知识库(per-KB 权限)。
// 写工具(10.4)只生成待审批提案,不执行;仅运营端对话挂载(创作者端自建工具集,不含写工具)。
export function makeTools(session: SessionPayload, ctx: ToolContext = {}) {
  return wrapJsonSafe({
    [TOOL_DEFS.streamerProfile.name]: streamerProfileTool(),
    [TOOL_DEFS.videoSummary.name]: videoSummaryTool(),
    [TOOL_DEFS.videoRank.name]: videoRankTool(),
    [TOOL_DEFS.activitySummary.name]: activitySummaryTool(),
    [TOOL_DEFS.incentiveExplain.name]: incentiveExplainTool(),
    [TOOL_DEFS.crawlerTaskStatus.name]: crawlerTaskStatusTool(),
    [TOOL_DEFS.knowledgeSearch.name]: knowledgeSearchTool(session),
    [TOOL_DEFS.incentiveCompute.name]: incentiveComputeTool(session, ctx),
    [TOOL_DEFS.crawlerTaskRerun.name]: crawlerTaskRerunTool(session, ctx),
    [TOOL_DEFS.crawlerTaskCancel.name]: crawlerTaskCancelTool(session, ctx),
    [TOOL_DEFS.activityStatus.name]: activityStatusTool(session, ctx),
    [TOOL_DEFS.activityUpdate.name]: activityUpdateTool(session, ctx),
  });
}
