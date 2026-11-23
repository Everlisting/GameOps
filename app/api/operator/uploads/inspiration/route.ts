/**
 * 原文件流式上传：POST ?kind=cover|image|video|audio|doc，Content-Type 为文件 MIME。
 * 兼容旧 multipart/form-data（file + kind）。只在校验完成后发布文件路径。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { badRequest } from "@/lib/errors";
import { INSPIRATION_UPLOAD_CONFIG, INSPIRATION_UPLOAD_KINDS, inspirationUploadSizeError, type InspirationUploadKind } from "@/lib/inspiration-upload";
import { writeInspirationUpload } from "@/lib/inspiration-upload.server";

export const runtime = "nodejs";
const kindSchema = z.enum(INSPIRATION_UPLOAD_KINDS);

export const POST = route(async (req) => {
  await requireRole("OPERATOR");
  let kind: InspirationUploadKind;
  let mime: string;
  let stream: ReadableStream<Uint8Array>;
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.toLowerCase().startsWith("multipart/form-data")) {
    // 旧客户端兼容路径；新页面直接上传原文件，不调用 formData() 缓冲大文件。
    const length = Number(req.headers.get("content-length"));
    if (length > INSPIRATION_UPLOAD_CONFIG.doc.maxBytes + 64 * 1024) throw badRequest("上传请求过大，单文件最大 1 GB");
    let form: FormData;
    try { form = await req.formData(); } catch { throw badRequest("请求体必须是有效的 multipart/form-data"); }
    kind = kindSchema.parse(form.get("kind"));
    const file = form.get("file");
    if (!(file instanceof File)) throw badRequest("缺少 file 字段");
    const error = inspirationUploadSizeError(kind, file.size);
    if (error) throw badRequest(error);
    mime = file.type;
    stream = file.stream();
  } else {
    kind = kindSchema.parse(new URL(req.url).searchParams.get("kind"));
    if (!req.body) throw badRequest("缺少文件内容");
    mime = contentType.split(";")[0].trim().toLowerCase();
    const length = req.headers.get("content-length");
    if (length !== null) {
      const error = inspirationUploadSizeError(kind, Number(length));
      if (error) throw badRequest(error);
    }
    stream = req.body;
  }

  const config = INSPIRATION_UPLOAD_CONFIG[kind];
  const formats: Readonly<Record<string, string>> = config.mimeToExt;
  if (!Object.hasOwn(formats, mime)) throw badRequest(`${config.label}仅支持 ${Object.keys(formats).join(" / ")}`);
  const directory = path.join(process.cwd(), "public", "uploads", "inspirations", kind);
  await fs.mkdir(directory, { recursive: true });
  const id = crypto.randomUUID();
  const filename = `${id}.${formats[mime]}`;
  const temporaryPath = path.join(directory, `.${id}.part`);
  const size = await writeInspirationUpload(stream, temporaryPath, config.maxBytes, `${config.label}不能超过 ${config.limitLabel}`);
  try {
    await fs.rename(temporaryPath, path.join(directory, filename));
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
  return Response.json({ url: `/uploads/inspirations/${kind}/${filename}`, size, mime });
});
