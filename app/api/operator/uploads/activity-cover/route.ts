/**
 * POST /api/operator/uploads/activity-cover — 上传活动封面图。
 * 落在 public/uploads/activity-covers/<uuid>.<ext>,返回站内可访问路径。
 *
 * 现阶段直接写本地 public/,够本地开发用。上线阿里云后,如换 OSS,只需替换写盘逻辑,
 * 返回 URL 协议保持 `/uploads/...` 或 `https://...`,前端无需改动。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { badRequest } from "@/lib/errors";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const runtime = "nodejs";

export const POST = route(async (req) => {
  await requireRole("OPERATOR");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("请求体必须是 multipart/form-data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("缺少 file 字段");

  const ext = EXT_BY_MIME[file.type];
  if (!ext) throw badRequest("仅支持 png / jpg / webp / gif");
  if (file.size === 0) throw badRequest("文件为空");
  if (file.size > MAX_BYTES) throw badRequest("文件超过 5 MB");

  const bytes = Buffer.from(await file.arrayBuffer());

  const dir = path.join(process.cwd(), "public", "uploads", "activity-covers");
  await fs.mkdir(dir, { recursive: true });

  const filename = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(dir, filename), bytes);

  return Response.json({ url: `/uploads/activity-covers/${filename}` });
});
