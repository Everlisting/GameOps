/**
 * POST /api/opinion/tasks/[id]/rerun — 用相同输入 + 当前 LLM 设置重跑
 *
 * 鉴权:ADMIN
 * 副作用:审计 opinion.rerun,新 task 存原 scope / parent 关系
 *
 * 分析服务端会:private/public 复用原 input 文件;combined 复用两个 parent
 * 引用。若原 input 已被删或某个 parent 状态非 DONE,分析服务 409。
 */
import type { Prisma } from "@prisma/client";

import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { readInternalSettings } from "@/lib/opinion/settings";
import { getTask, rerunTask } from "@/lib/opinion/client";

export const POST = route(async (_req, { params }) => {
  const session = await requireRole("ADMIN");
  const fromId = params?.id ?? "";
  const src = await getTask(fromId); // 校验存在;不存在 404
  const settings = await readInternalSettings();

  const created = await rerunTask({
    taskId: fromId,
    createdBy: session.username,
    settings,
  });

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "opinion.rerun",
    targetType: "opinion_task",
    targetId: created.task_id,
    details: {
      fromTaskId: fromId,
      scope: src.scope,
      game: src.game,
      llmProvider: settings.provider,
      llmModel: settings.model,
    } as Prisma.InputJsonValue,
  });

  return Response.json({ taskId: created.task_id, status: created.status }, { status: 201 });
});
