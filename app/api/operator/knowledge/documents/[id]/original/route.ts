/** GET /api/operator/knowledge/documents/[id]/original — 鉴权后查看/下载不可变原件。ADMIN。 */
import path from "node:path";

import { route } from "@/lib/api";
import { readKbFile } from "@/lib/assistant/kb-storage";
import { prisma } from "@/lib/db";
import { AppError, badRequest } from "@/lib/errors";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const INLINE_MIME_TYPES = new Set([
  "application/pdf",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
  "text/plain",
  "text/markdown",
  "text/csv",
]);

function safeFilename(title: string, storagePath: string): string {
  const ext = path.extname(storagePath);
  const base = title.replace(/[\r\n"\\/]/g, "_").trim() || "knowledge-document";
  return path.extname(base) ? base : `${base}${ext}`;
}

export const GET = route(async (_req, { params }) => {
  await requireRole("ADMIN");
  const id = params?.id;
  if (!id) throw badRequest("缺少 id");
  const doc = await prisma.knowledgeDocument.findUnique({
    where: { id },
    select: { title: true, mimeType: true, storagePath: true },
  });
  if (!doc) throw new AppError("NOT_FOUND", "文档不存在");
  if (!doc.storagePath) throw new AppError("NOT_FOUND", "该文档没有原件");

  let buffer: Buffer;
  try {
    buffer = await readKbFile(doc.storagePath);
  } catch {
    throw new AppError("NOT_FOUND", "原件文件不存在");
  }
  const inline = INLINE_MIME_TYPES.has(doc.mimeType);
  const responseMimeType = inline ? doc.mimeType : "application/octet-stream";
  const filename = safeFilename(doc.title, doc.storagePath);
  const headers = new Headers({
    "Content-Type": responseMimeType,
    "Content-Length": String(buffer.byteLength),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    ...(inline ? { "Content-Security-Policy": "sandbox; default-src 'none'" } : {}),
  });
  const body = new Uint8Array(buffer.byteLength);
  body.set(buffer);
  return new Response(body, { headers });
});
