/**
 * POST /api/agent/tasks/[id]/prepare
 *
 * Agent 在真正启动子进程前冻结:
 * - 实际执行的 Git commit / SVN revision
 * - Agent、Python、Git、OS、pip 依赖和渲染命令指纹
 *
 * sourceRevision 一旦写入不可改。重新排队或重跑时 Agent 必须检出同一 revision。
 */
import { Prisma } from "@prisma/client";

import { requireAgent } from "@/lib/agent-auth";
import { parseJson, route } from "@/lib/api";
import { findExecutionDrift } from "@/lib/crawler/reproducibility";
import { prisma } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/errors";
import {
  executionSnapshotSchema,
  taskPrepareSchema,
} from "@/lib/validation/crawler";

export const POST = route(async (req, { params }) => {
  const agent = await requireAgent(req);
  const taskId = params?.id ?? "";
  if (!taskId) throw badRequest("缺少任务 id");

  const input = await parseJson(req, taskPrepareSchema);
  const task = await prisma.crawlerTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      agentId: true,
      status: true,
      sourceRevision: true,
      executionSnapshot: true,
      rerunOf: {
        select: {
          id: true,
          executionSnapshot: true,
        },
      },
    },
  });
  if (!task) throw notFound("任务不存在");
  if (task.agentId !== agent.id) throw conflict("任务不属于当前 agent");
  if (task.status !== "RUNNING") throw conflict("任务当前状态不可冻结执行信息");
  if (
    task.sourceRevision &&
    task.sourceRevision.toLowerCase() !== input.sourceRevision.toLowerCase()
  ) {
    throw conflict(
      `源码 revision 已冻结为 ${task.sourceRevision},拒绝改为 ${input.sourceRevision}`,
    );
  }

  const currentSnapshot = executionSnapshotSchema.safeParse(
    task.executionSnapshot,
  );
  const rerunBaseline = executionSnapshotSchema.safeParse(
    task.rerunOf?.executionSnapshot,
  );
  const baseline = currentSnapshot.success
    ? currentSnapshot.data
    : rerunBaseline.success
      ? rerunBaseline.data
      : null;
  if (baseline) {
    const drift = findExecutionDrift(baseline, input.executionSnapshot);
    if (drift.length > 0) {
      throw badRequest(
        `执行环境与${task.rerunOf ? `来源任务 ${task.rerunOf.id}` : "原执行"}不一致`,
        drift,
      );
    }
  }

  const data: Prisma.CrawlerTaskUpdateInput = {};
  if (!task.sourceRevision) data.sourceRevision = input.sourceRevision;
  if (!task.executionSnapshot) {
    data.executionSnapshot =
      input.executionSnapshot as unknown as Prisma.InputJsonValue;
  }
  if (Object.keys(data).length > 0) {
    await prisma.crawlerTask.update({ where: { id: task.id }, data });
  }

  return Response.json({
    ok: true,
    sourceRevision: task.sourceRevision ?? input.sourceRevision,
    frozen: true,
  });
});
