import { describe, expect, it } from "vitest";
import { identifyInspirationFile, inspirationFiles, inspirationFilesSchema, type InspirationFileData } from "./inspiration-files";
import { inspirationCreateSchema } from "./validation/inspiration";

const image: InspirationFileData = { id: "image-1", name: "立绘.png", kind: "image", mime: "image/png", size: 1024, url: "/uploads/inspirations/image/a.png" };
const video: InspirationFileData = { id: "video-1", name: "演示.mp4", kind: "video", mime: "video/mp4", size: 2048, url: "/uploads/inspirations/video/b.mp4" };
const doc: InspirationFileData = { id: "doc-1", name: "说明.zip", kind: "doc", mime: "application/zip", size: 4096, url: "/uploads/inspirations/doc/c.zip" };

describe("混合格式素材附件", () => {
  it("同一素材可保存图片、视频与压缩包，不受分类约束", () => {
    const parsed = inspirationCreateSchema.safeParse({ type: "MATERIAL", category: "IMAGE", title: "混合素材", summary: null, content: null, url: null, coverImage: null, files: [image, video, doc] });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.files.map((file) => file.kind)).toEqual(["image", "video", "doc"]);
  });
  it("保留附件顺序，首文件可改变，读取不回退到旧url", () => {
    const result = inspirationFiles({ title: "素材", url: image.url, files: [video, image, doc] });
    expect(result.map((file) => file.id)).toEqual(["video-1", "image-1", "doc-1"]);
  });
  it("旧单文件和外链自动兼容，不需要改写旧数据", () => {
    expect(inspirationFiles({ title: "原立绘", category: "IMAGE", files: [], url: image.url })).toEqual([expect.objectContaining({ id: "legacy", url: image.url, kind: "image" })]);
    expect(inspirationFiles({ title: "视频教程", type: "VIDEO_TUTORIAL", url: "https://www.douyin.com/video/123" })[0].kind).toBe("video");
  });
  it("逐文件校验上限，并拒绝重复ID与超过30项", () => {
    expect(inspirationFilesSchema.safeParse([{ ...image, size: 50 * 1024 * 1024 + 1 }]).success).toBe(false);
    expect(inspirationFilesSchema.safeParse([{ ...video, size: 500 * 1024 * 1024 }]).success).toBe(true);
    expect(inspirationFilesSchema.safeParse([image, image]).success).toBe(false);
    expect(inspirationFilesSchema.safeParse(Array.from({ length: 31 }, (_, index) => ({ ...image, id: `file-${index}` }))).success).toBe(false);
  });
  it("识别常见混合格式及浏览器缺失MIME时的扩展名", () => {
    expect(identifyInspirationFile("", "立绘.JPEG")).toEqual({ kind: "image", mime: "image/jpeg" });
    expect(identifyInspirationFile("application/octet-stream", "原始包.zip")?.kind).toBe("doc");
    expect(identifyInspirationFile("audio/mpeg", "配乐.mp3")?.kind).toBe("audio");
    expect(identifyInspirationFile("", "未知.exe")).toBeNull();
  });
});
