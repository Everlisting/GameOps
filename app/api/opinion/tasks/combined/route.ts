/**
 * POST /api/opinion/tasks/combined — 触发生成综合对比报告
 *
 * 鉴权:ADMIN
 * 入参:JSON { privateTaskId, publicTaskId, game? }
 * 出参:{ taskId, status: "PENDING" }
 * 副作用:审计 opinion.trigger
 *
 * 分析服务会校验两个 parent task 必须是 DONE 状态,否则 409。
 */
import type { Prisma } from "@prisma/client";

import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { triggerCombinedSchema } from "@/lib/validation/opinion";
import { readInternalSettings } from "@/lib/opinion/settings";
import { triggerCombined } from "@/lib/opinion/client";

export const POST = route(async (req) => {
  const session = await requireRole("ADMIN");
  const input = await parseJson(req, triggerCombinedSchema);
  const settings = await readInternalSettings();

  const created = await triggerCombined({
    privateTaskId: input.privateTaskId,
    publicTaskId: input.publicTaskId,
    game: input.game,
    createdBy: session.username,
    settings,
  });

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "opinion.trigger",
    targetType: "opinion_task",
    targetId: created.task_id,
    details: {
      scope: "combined",
      game: input.game ?? null,
      privateTaskId: input.privateTaskId,
      publicTaskId: input.publicTaskId,
      llmProvider: settings.provider,
      llmModel: settings.model,
    } as Prisma.InputJsonValue,
  });

  return Response.json({ taskId: created.task_id, status: created.status }, { status: 201 });
});
