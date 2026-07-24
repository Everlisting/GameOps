/**
 * 阶段10.4 · AI 助手 · 写操作工具(提案版,需人工审批)。
 *
 * 写工具**不执行**动作:调用即通过注册表生成提案 → 落一条 AiApproval(status=pending),
 * 返回「已生成待审批,尚未执行」给模型。运营在中台批准后由审批 API 幂等执行(见执行器注册表)。
 */
import { tool } from "ai";
import type { Prisma } from "@prisma/client";

import type { SessionPayload } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { TOOL_DEFS } from "@/lib/assistant/tools/schemas";
import { getApprovalHandler } from "@/lib/assistant/approvals/registry";
import { approvalDb } from "@/lib/assistant/approvals/db";

/** 写工具运行上下文:关联发起对话/执行,便于在对话里回显审批卡片。 */
export interface ToolContext {
  conversationId?: string;
  runId?: string;
}

/** 通用:构建提案 → 落 pending 审批 → 返回给模型。失败(预检不过)时不落审批,回错误。 */
async function propose(
  action: string,
  rawInput: unknown,
  session: SessionPayload,
  ctx: ToolContext,
) {
  const handler = getApprovalHandler(action);
  if (!handler) return { ok: false as const, error: `未注册的审批动作:${action}` };

  let draft;
  try {
    draft = await handler.buildProposal(rawInput);
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "无法生成提案" };
  }

  const approval = await approvalDb.create({
    data: {
      conversationId: ctx.conversationId ?? null,
      runId: ctx.runId ?? null,
      action: handler.action,
      title: draft.title,
      params: draft.params as Prisma.InputJsonValue,
      preview: draft.preview as Prisma.InputJsonValue,
      status: "pending",
      createdById: session.sub,
      createdByName: session.username,
    },
  });

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "approval.create",
    targetType: "ai_approval",
    targetId: approval.id,
    details: {
      action: handler.action,
      title: draft.title,
      params: draft.params,
    } as Prisma.InputJsonValue,
  });

  return {
    ok: true as const,
    approvalId: approval.id,
    status: "pending" as const,
    title: draft.title,
    preview: draft.preview,
    message:
      "已生成一条待审批操作,当前尚未执行。请如实告诉用户:操作已提交待审批,需运营在中台的审批卡片处点击「批准」后才会真正执行。",
  };
}

/** incentive_compute:发起全活动重算预估激励(需审批)。 */
export function incentiveComputeTool(session: SessionPayload, ctx: ToolContext) {
  return tool({
    description: TOOL_DEFS.incentiveCompute.description,
    inputSchema: TOOL_DEFS.incentiveCompute.input,
    execute: async (input) => propose("incentive.compute", input, session, ctx),
  });
}
