/**
 * DELETE /api/operator/knowledge/bases/[id] — 删除知识库(级联文档+切块)。ADMIN。
 */
import { route, parseJson } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { AppError, badRequest } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { kbPatchSchema } from "@/lib/validation/assistant";

export const runtime = "nodejs";

/** 切换 per-KB 权限(全体运营可见 / 仅管理员)。ADMIN。 */
export const PATCH = route(async (req, { params }) => {
  await requireRole("ADMIN");
  const id = params?.id;
  if (!id) throw badRequest("缺少 id");
  const { visibleToAll } = await parseJson(req, kbPatchSchema);
  const kb = await prisma.knowledgeBase.findUnique({ where: { id }, select: { id: true } });
  if (!kb) throw new AppError("NOT_FOUND", "知识库不存在");
  await prisma.knowledgeBase.update({ where: { id }, data: { visibleToAll } });
  return Response.json({ ok: true });
});

export const DELETE = route(async (_req, { params }) => {
  const session = await requireRole("ADMIN");
  const id = params?.id;
  if (!id) throw badRequest("缺少 id");
  const kb = await prisma.knowledgeBase.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!kb) throw new AppError("NOT_FOUND", "知识库不存在");
  await prisma.knowledgeBase.delete({ where: { id } });
  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "kb.delete",
    targetType: "knowledge_document",
    targetId: id,
    details: { name: kb.name, kind: "base" },
  });
  return Response.json({ ok: true });
});
