/**
 * POST /api/operator/uploads/inspiration — 创作灵感资源上传。
 *
 * 入参(multipart/form-data):
 *   - file:File
 *   - kind:cover | image | video | doc(决定 MIME 白名单 + 大小上限 + 落盘子目录)
 *
 * 落盘:public/uploads/inspirations/<kind>/<uuid>.<ext>,返回站内路径。
 *
 * 上线 OSS 后:把写盘那段换成 OSS putObject,返回 OSS 的 https URL,前端无感知
 * (前端字段统一存"URL or 站内路径",zod 已经在 lib/validation/inspiration.ts 同时接两种)。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { badRequest } from "@/lib/errors";

export const runtime = "nodejs";

type Kind = "cover" | "image" | "video" | "doc";

const KIND_CONFIG: Record<
  Kind,
  { maxBytes: number; mimeToExt: Record<string, string>; label: string }
> = {
  cover: {
    maxBytes: 5 * 1024 * 1024,
    mimeToExt: {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
    },
    label: "封面图",
  },
  image: {
    maxBytes: 10 * 1024 * 1024,
    mimeToExt: {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/svg+xml": "svg",
    },
    label: "图片素材",
  },
  video: {
    maxBytes: 200 * 1024 * 1024,
    mimeToExt: {
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov",
    },
    label: "视频资源",
  },
  doc: {
    maxBytes: 20 * 1024 * 1024,
    mimeToExt: {
      "application/pdf": "pdf",
      "text/plain": "txt",
      "text/markdown": "md",
      "application/zip": "zip",
    },
    label: "文档资源",
  },
};

function isKind(v: string | null): v is Kind {
  return v === "cover" || v === "image" || v === "video" || v === "doc";
}

export const POST = route(async (req) => {
  await requireRole("OPERATOR");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("请求体必须是 multipart/form-data");
  }

  const kindRaw = form.get("kind");
  const kind = typeof kindRaw === "string" ? kindRaw : null;
  if (!isKind(kind)) throw badRequest("kind 必须是 cover/image/video/doc");

  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("缺少 file 字段");

  const cfg = KIND_CONFIG[kind];
  const ext = cfg.mimeToExt[file.type];
  if (!ext) {
    const allow = Object.keys(cfg.mimeToExt).join(" / ");
    throw badRequest(`${cfg.label}仅支持 ${allow}`);
  }
  if (file.size === 0) throw badRequest("文件为空");
  if (file.size > cfg.maxBytes) {
    throw badRequest(
      `${cfg.label}不能超过 ${Math.round(cfg.maxBytes / 1024 / 1024)} MB`,
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const dir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "inspirations",
    kind,
  );
  await fs.mkdir(dir, { recursive: true });

  const filename = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(dir, filename), bytes);

  return Response.json({
    url: `/uploads/inspirations/${kind}/${filename}`,
    size: file.size,
    mime: file.type,
  });
});
