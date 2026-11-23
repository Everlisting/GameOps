import { z } from "zod";
import { INSPIRATION_UPLOAD_CONFIG } from "./inspiration-upload";

export const MAX_INSPIRATION_FILES = 30;
export const resourceKinds = ["image", "video", "audio", "doc"] as const;
export type ResourceKind = (typeof resourceKinds)[number];
const fileUrl = z.string().trim().min(1).max(500).refine((value) => /^https?:\/\//i.test(value) || /^\/uploads\/inspirations\//.test(value), "附件链接无效");
export const inspirationFileSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(1, "请填写文件显示名称").max(255, "文件显示名称不超过255字"),
  url: fileUrl,
  kind: z.enum(resourceKinds),
  mime: z.string().max(100),
  size: z.number().int().nonnegative(),
}).superRefine((file, context) => {
  if (file.size > INSPIRATION_UPLOAD_CONFIG[file.kind].maxBytes) context.addIssue({ code: "custom", path: ["size"], message: `${file.name}不能超过 ${INSPIRATION_UPLOAD_CONFIG[file.kind].limitLabel}` });
});
export const inspirationFilesSchema = z.array(inspirationFileSchema).max(MAX_INSPIRATION_FILES, "一个素材最多30个文件").superRefine((files, context) => {
  if (new Set(files.map((file) => file.id)).size !== files.length) context.addIssue({ code: "custom", message: "附件标识不可重复" });
});
export type InspirationFileData = z.infer<typeof inspirationFileSchema>;

export function localInspirationUpload(url: string) {
  const match = /^\/uploads\/inspirations\/(cover|image|video|audio|doc)\/([A-Za-z0-9_-][A-Za-z0-9_.-]*)$/.exec(url);
  return match ? { kind: match[1], filename: match[2] } : null;
}

export function isStoryInspiration(item: { tags?: string[]; category?: string | null }) {
  return item.category === "TEXT_STORY" || item.tags?.includes("故事素材") === true;
}

export function storyArchiveMedia(
  item: { title: string; coverImage?: string | null },
  files: InspirationFileData[],
): InspirationFileData[] {
  if (files.length) {
    return files.filter((file) => {
      const upload = localInspirationUpload(file.url);
      return upload?.kind === "image" || upload?.kind === "video";
    });
  }
  if (!item.coverImage) return [];
  const cover = localInspirationUpload(item.coverImage);
  if (cover?.kind !== "cover" && cover?.kind !== "image") return [];
  return [{
    id: "legacy-cover", name: item.title, url: item.coverImage,
    kind: "image", mime: "", size: 0,
  }];
}

export function identifyInspirationFile(mime: string, name: string): { kind: ResourceKind; mime: string } | null {
  for (const kind of resourceKinds) if (Object.hasOwn(INSPIRATION_UPLOAD_CONFIG[kind].mimeToExt, mime)) return { kind, mime };
  const extension = name.split(".").pop()?.toLowerCase();
  const extra: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", md: "text/markdown" };
  if (extension && extra[extension]) return identifyInspirationFile(extra[extension], "");
  for (const kind of resourceKinds) {
    const pair = Object.entries(INSPIRATION_UPLOAD_CONFIG[kind].mimeToExt).find(([, value]) => value === extension);
    if (pair) return { kind, mime: pair[0] };
  }
  return null;
}

/** 新附件优先；旧 url 转成单个附件，不改写历史记录。 */
export function inspirationFiles(item: { files?: unknown; url: string | null; title: string; type?: string; category?: string | null }): InspirationFileData[] {
  const result = inspirationFilesSchema.safeParse(item.files);
  if (result.success && result.data.length) return result.data;
  if (!item.url) return [];
  let name = item.title;
  try { name = decodeURIComponent(item.url.split("/").pop()?.split("?")[0] || item.title); } catch { /* 回退标题。 */ }
  const identity = identifyInspirationFile("", name);
  if (item.url.startsWith("/uploads/inspirations/")) name = item.title + (name.includes(".") ? `.${name.split(".").pop()}` : "");
  const kind: ResourceKind = identity?.kind ?? (item.type === "VIDEO_TUTORIAL" || item.category === "VIDEO" ? "video" : item.category === "IMAGE" ? "image" : item.category === "AUDIO" ? "audio" : "doc");
  return [{ id: "legacy", name: name.slice(0, 255), url: item.url, kind, mime: identity?.mime ?? "", size: 0 }];
}

export function formatFileSize(bytes: number): string {
  if (!bytes) return "大小未知";
  if (bytes < 1024) return `${bytes} B`;
  const unit = bytes >= 1024 ** 3 ? "GB" : bytes >= 1024 ** 2 ? "MB" : "KB";
  const divisor = unit === "GB" ? 1024 ** 3 : unit === "MB" ? 1024 ** 2 : 1024;
  return `${(bytes / divisor).toFixed(1)} ${unit}`;
}
