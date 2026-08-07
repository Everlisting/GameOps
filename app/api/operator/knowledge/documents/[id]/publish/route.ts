/** POST /api/operator/knowledge/documents/[id]/publish — 将草稿排入索引，成功后由 worker 原子发布。ADMIN。 */
import { parseJson, route } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { AppError, badRequest, conflict } from "@/lib/errors";
import { requireRole } from "@/lib/rbac";
import { knowledgePublishSchema } from "@/lib/validation/assistant";

export const runtime = "nodejs";

export const POST = route(async (req, { params }) => {
  const session = await requireRole("ADMIN");
  const id = params?.id;
  if (!id) throw badRequest("缺少 id");
  const input = await parseJson(req, knowledgePublishSchema);

  const version = await prisma.knowledgeDocumentVersion.findFirst({
    where: { id: input.versionId, documentId: id },
    select: { id: true, version: true, revision: true, content: true, checksum: true, status: true },
  });
  if (!version) throw new AppError("NOT_FOUND", "草稿版本不存在");
  if (version.status !== "draft" && version.status !== "failed") {
    throw conflict("该版本当前不可发布，请刷新页面");
  }
  if (version.revision !== input.baseRevision) {
    throw conflict("草稿已被修改，请先刷新", { expectedRevision: version.revision });
  }
  if (!version.content.trim()) throw badRequest("正文为空，不能发布");

  const claimed = await prisma.knowledgeDocumentVersion.updateMany({
    where: {
      id: version.id,
      revision: input.baseRevision,
      status: { in: ["draft", "failed"] },
    },
    data: { status: "pending", error: null },
  });
  if (claimed.count !== 1) throw conflict("版本状态已变化，请刷新后重试");

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "kb.publish",
    targetType: "knowledge_document",
    targetId: id,
    details: { versionId: version.id, version: version.version, checksum: version.checksum },
  });
  return Response.json({ ok: true, status: "pending" });
});
