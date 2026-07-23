/**
 * DELETE /api/operator/knowledge/documents/[id] — 删除文档(级联切块)。ADMIN。
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { AppError, badRequest } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { removeKbFile } from "@/lib/assistant/kb-storage";

export const runtime = "nodejs";

export const DELETE = route(async (_req, { params }) => {
  const session = await requireRole("ADMIN");
  const id = params?.id;
  if (!id) throw badRequest("缺少 id");
  const doc = await prisma.knowledgeDocument.findUnique({
    where: { id },
    select: { id: true, title: true, storagePath: true },
  });
  if (!doc) throw new AppError("NOT_FOUND", "文档不存在");
  await prisma.knowledgeDocument.delete({ where: { id } });
  await removeKbFile(doc.storagePath);
  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "kb.delete",
    targetType: "knowledge_document",
    targetId: id,
    details: { title: doc.title },
  });
  return Response.json({ ok: true });
});
