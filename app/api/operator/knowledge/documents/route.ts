/**
 * POST /api/operator/knowledge/documents — 上传文档(存文件 + 置 pending 即返回,后台 indexer 解析索引)。ADMIN。
 * 收 multipart:kbId + file(+ 可选 title)。支持 txt/md/csv/json/docx/pdf/图片(扫描件走 OCR)。
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { AppError, badRequest } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { isSupportedFile } from "@/lib/assistant/parse";
import { saveKbFile } from "@/lib/assistant/kb-storage";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const session = await requireRole("ADMIN");
  const form = await req.formData();
  const kbId = String(form.get("kbId") ?? "");
  const file = form.get("file");
  if (!kbId) throw badRequest("缺少 kbId");
  if (!(file instanceof File)) throw badRequest("缺少文件");

  const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId }, select: { id: true } });
  if (!kb) throw new AppError("NOT_FOUND", "知识库不存在");

  const titleRaw = form.get("title");
  const title = titleRaw ? String(titleRaw).trim() : file.name || "文档";
  const mime = file.type || "application/octet-stream";
  if (!isSupportedFile(file.name, mime)) {
    throw badRequest("不支持的文件类型(txt / md / csv / json / docx / pdf / 图片)");
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const doc = await prisma.knowledgeDocument.create({
    data: { kbId, title, source: "upload", mimeType: mime, status: "pending", createdById: session.sub },
    select: { id: true },
  });
  const storagePath = await saveKbFile(doc.id, file.name, buf);
  await prisma.knowledgeDocument.update({ where: { id: doc.id }, data: { storagePath } });

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "kb.upload",
    targetType: "knowledge_document",
    targetId: doc.id,
    details: { kbId, title },
  });

  return Response.json({ id: doc.id, status: "pending" });
});
