const MB = 1024 * 1024;
export const INSPIRATION_UPLOAD_KINDS = ["cover", "image", "video", "audio", "doc"] as const;

/** 浏览器提示、上传前检查和服务端校验共用同一套限制。 */
export const INSPIRATION_UPLOAD_CONFIG = {
  cover: { maxBytes: 5 * MB, limitLabel: "5 MB", label: "封面图", mimeToExt: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" } },
  image: { maxBytes: 50 * MB, limitLabel: "50 MB", label: "图片素材", mimeToExt: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" } },
  video: { maxBytes: 500 * MB, limitLabel: "500 MB", label: "视频资源", mimeToExt: { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" } },
  audio: { maxBytes: 100 * MB, limitLabel: "100 MB", label: "音效配乐", mimeToExt: { "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/mp4": "m4a" } },
  doc: { maxBytes: 1024 * MB, limitLabel: "1 GB", label: "文档 / 压缩包", mimeToExt: { "application/pdf": "pdf", "text/plain": "txt", "text/markdown": "md", "application/zip": "zip", "application/x-zip-compressed": "zip" } },
} satisfies Record<string, { maxBytes: number; limitLabel: string; label: string; mimeToExt: Record<string, string> }>;

export type InspirationUploadKind = keyof typeof INSPIRATION_UPLOAD_CONFIG;

export function inspirationUploadSizeError(kind: InspirationUploadKind, size: number): string | null {
  const config = INSPIRATION_UPLOAD_CONFIG[kind];
  if (size === 0) return "文件为空";
  return size > config.maxBytes ? `${config.label}不能超过 ${config.limitLabel}` : null;
}
