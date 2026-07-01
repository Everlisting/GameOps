/**
 * POST /api/opinion/tasks/public — 触发生成公域(社媒合并 JSON)舆情报告
 *
 * 鉴权:ADMIN
 * 入参:multipart/form-data
 *   - file: 三平台合并产物 .json(<= 50MB;运营用 scripts/merge_platforms.py 产出)
 *   - game, coverageSpan
 * 出参:{ taskId, status: "PENDING" }
 * 副作用:审计 opinion.trigger
 */
import type { Prisma } from "@prisma/client";

import { route } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { triggerFormSchema } from "@/lib/validation/opinion";
import { readInternalSettings } from "@/lib/opinion/settings";
import { triggerFileTask } from "@/lib/opinion/client";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXTS = new Set([".json"]);

export const POST = route(async (req) => {
  const session = await requireRole("ADMIN");
  const form = await req.formData();

  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("缺少 file 字段");
  if (!file.name) throw badRequest("上传文件缺少文件名");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw badRequest(`文件超过 ${MAX_UPLOAD_BYTES / 1024 / 1024} MB 上限`);
  }
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    throw badRequest("公域报告只接受 .json(social_*.json)");
  }

  const meta = triggerFormSchema.parse({
    game: form.get("game")?.toString() ?? undefined,
    coverageSpan: form.get("coverageSpan")?.toString() ?? undefined,
  });
  const settings = await readInternalSettings();

  const created = await triggerFileTask("public", {
    file,
    fileName: file.name,
    game: meta.game,
    coverageSpan: meta.coverageSpan,
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
      scope: "public",
      game: meta.game,
      coverageSpan: meta.coverageSpan ?? null,
      inputFileName: file.name,
      inputFileSize: file.size,
      llmProvider: settings.provider,
      llmModel: settings.model,
    } as Prisma.InputJsonValue,
  });

  return Response.json({ taskId: created.task_id, status: created.status }, { status: 201 });
});
