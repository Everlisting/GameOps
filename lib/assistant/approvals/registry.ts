/**
 * 阶段10.4 · 需审批的写操作 · 执行器注册表。
 *
 * 一个 action 对应一个 handler:
 *   - buildProposal:把工具原始入参 → 校验 + 轻量预检 + 生成人类可读提案(title/preview/params)。
 *     失败直接抛错,写工具据此告知模型「无法生成提案」,不落 AiApproval。
 *   - execute:运营批准后幂等执行,复用现有业务逻辑,返回结果摘要。
 *
 * 新增写动作 = 在此加一个 handler + 在 tools/schemas.ts 加工具定义 + tools/index.ts 挂载。
 */
import type { Role } from "@prisma/client";
import { z } from "zod";

import {
  previewActivityCompute,
  computeActivityIncentives,
} from "@/lib/incentive/compute";

export interface ApprovalActor {
  id: string;
  username: string;
}

export interface ProposalDraft {
  title: string;
  preview: Record<string, unknown>;
  params: Record<string, unknown>;
}

export interface ApprovalHandler {
  action: string;
  /** 审批人所需最小角色(requireRole 会按层级放行 ADMIN)。 */
  requiredRole: Role;
  /** 校验 + 预检 + 生成提案;失败抛错(不落审批)。 */
  buildProposal(rawInput: unknown): Promise<ProposalDraft>;
  /** 批准后幂等执行,返回结果摘要(存入 AiApproval.result)。 */
  execute(params: unknown, actor: ApprovalActor): Promise<Record<string, unknown>>;
}

// ── incentive.compute:全活动重算预估激励 ──────────────────────────────
const incentiveComputeInput = z.object({
  activityId: z.string().min(1, "需要活动 id"),
});

const incentiveComputeHandler: ApprovalHandler = {
  action: "incentive.compute",
  requiredRole: "OPERATOR",
  async buildProposal(raw) {
    const { activityId } = incentiveComputeInput.parse(raw);
    const { activityName, rulesCount, submissionsCount, candidateCount } =
      await previewActivityCompute(activityId);
    return {
      title: `重算活动《${activityName}》的预估激励`,
      preview: {
        activityId,
        activityName,
        rulesCount,
        submissionsCount,
        candidateCount,
        scope: "候选=报名∪投稿;人工调整(adjusted)保留不动",
        effect: "覆盖每位候选创作者的预估激励金额、明细和计算时间",
      },
      params: { activityId },
    };
  },
  async execute(params, actor) {
    const { activityId } = incentiveComputeInput.parse(params);
    const summary = await computeActivityIncentives(activityId, {
      id: actor.id,
      username: actor.username,
    });
    return { ...summary };
  },
};

export const APPROVAL_HANDLERS: Record<string, ApprovalHandler> = {
  [incentiveComputeHandler.action]: incentiveComputeHandler,
};

export function getApprovalHandler(action: string): ApprovalHandler | undefined {
  return APPROVAL_HANDLERS[action];
}
