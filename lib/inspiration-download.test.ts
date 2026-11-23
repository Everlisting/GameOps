import { beforeEach, describe, expect, it, vi } from "vitest";
const findFirst = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: { inspiration: { findFirst } } }));
import { downloadPublishedInspiration, inspirationFilePath } from "./inspiration-download";

beforeEach(() => { vi.clearAllMocks(); });

describe("公开素材下载", () => {
  it("故事 ZIP 包含正文，排除非图片视频附件和外链", async () => {
    findFirst.mockResolvedValueOnce({
      title: "山间故事",
      tags: ["故事素材"],
      url: null,
      content: "第一幕\n相遇",
      files: [
        { id: "audio", name: "配乐.mp3", kind: "audio", mime: "audio/mpeg", size: 10, url: "/uploads/inspirations/audio/not-present.mp3" },
        { id: "video", name: "外部视频", kind: "video", mime: "", size: 0, url: "https://example.com/video.mp4" },
      ],
    });
    const response = await downloadPublishedInspiration("story", undefined, true);
    const archive = Buffer.from(await response.arrayBuffer());
    expect(archive.includes(Buffer.from("故事正文.txt"))).toBe(true);
    expect(archive.includes(Buffer.from("配乐.mp3"))).toBe(false);
    expect(archive.includes(Buffer.from("外部视频"))).toBe(false);
  });

  it("ZIP 下载同样检查发布状态，并在响应前报告缺失文件", async () => {
    findFirst.mockResolvedValueOnce(null);
    await expect(downloadPublishedInspiration("draft", undefined, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "draft", published: true } }));

    findFirst.mockResolvedValueOnce({
      title: "缺少附件",
      url: null,
      content: null,
      files: [{
        id: "missing", name: "缺失.png", kind: "image", mime: "image/png", size: 10,
        url: "/uploads/inspirations/image/nonexistent-archive-test-5339.png",
      }],
    });
    await expect(downloadPublishedInspiration("missing", undefined, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("ZIP 保留中文素材名称，并为同名外链生成不同的文本条目", async () => {
    findFirst.mockResolvedValueOnce({
      title: "组合素材",
      url: null,
      content: null,
      files: ["a", "b"].map((id) => ({
        id, name: "参考资料", kind: "doc", mime: "", size: 0,
        url: `https://example.com/${id}`,
      })),
    });
    const response = await downloadPublishedInspiration("asset", undefined, true);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(decodeURIComponent(response.headers.get("content-disposition") ?? "")).toContain("组合素材.zip");
    const archive = Buffer.from(await response.arrayBuffer());
    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(archive.includes(Buffer.from("参考资料（外部链接）.txt"))).toBe(true);
    expect(archive.includes(Buffer.from("参考资料（外部链接） (2).txt"))).toBe(true);
  });

  it("文件ID必须属于当前已发布素材，不能跨素材取附件", async () => {
    findFirst.mockResolvedValue({ title: "多文件", url: null, content: null, files: [{ id: "mine", name: "图片.png", kind: "image", mime: "image/png", size: 10, url: "/uploads/inspirations/image/a.png" }] });
    await expect(downloadPublishedInspiration("asset", "someone-else")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("草稿、删除资源均拒绝，并在服务端强制检查发布状态", async () => {
    findFirst.mockResolvedValue(null);
    await expect(downloadPublishedInspiration("draft")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "draft", published: true } }));
  });
  it("文本资源下载保留正文，中文名称采用附件编码", async () => {
    findFirst.mockResolvedValue({ title: "故事\r\n素材", url: null, content: "第一幕\n人物故事" });
    const response = await downloadPublishedInspiration("story");
    expect(await response.text()).toBe("第一幕\n人物故事");
    expect(response.headers.get("content-disposition")).toContain("attachment;");
    expect(response.headers.get("content-disposition")).toContain("filename*=UTF-8''");
    expect(response.headers.get("content-disposition")).not.toContain("\r");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("不代理任意外链或访问非素材目录", async () => {
    for (const url of ["https://example.com/file.zip", "http://127.0.0.1/private", "/uploads/inspirations/image/../../secret", "/uploads/inspirations/image/%2e%2e%2fsecret", "/uploads/inspirations/image/..\\secret", "/uploads/other/file.png"]) {
      expect(inspirationFilePath(url)).toBeNull();
      findFirst.mockResolvedValue({ title: "测试", url, content: null });
      await expect(downloadPublishedInspiration("id")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(inspirationFilePath("/uploads/inspirations/image/file-1.png")).toBeTruthy();
  });
});
