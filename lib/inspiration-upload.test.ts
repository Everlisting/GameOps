import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { INSPIRATION_UPLOAD_CONFIG, inspirationUploadSizeError } from "./inspiration-upload";
import { writeInspirationUpload } from "./inspiration-upload.server";

describe("素材原文件上传", () => {
  let directory: string;
  let temporaryPath: string;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "gameops-inspiration-upload-"));
    temporaryPath = path.join(directory, "upload.part");
  });
  afterEach(async () => {
    await fs.rm(temporaryPath, { force: true });
    await fs.rmdir(directory);
  });
  function stream(chunks: number[][]) {
    return new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk)); controller.close(); } });
  }
  it("各类上限精确为 5/50/500/100 MB 和 1 GB，边界允许、超一字节拒绝", () => {
    const MB = 1024 * 1024;
    const limits = { cover: 5 * MB, image: 50 * MB, video: 500 * MB, audio: 100 * MB, doc: 1024 * MB };
    for (const kind of ["cover", "image", "video", "audio", "doc"] as const) {
      expect(INSPIRATION_UPLOAD_CONFIG[kind].maxBytes).toBe(limits[kind]);
      expect(inspirationUploadSizeError(kind, limits[kind])).toBeNull();
      expect(inspirationUploadSizeError(kind, limits[kind] + 1)).toContain(INSPIRATION_UPLOAD_CONFIG[kind].limitLabel);
    }
  });
  it("逐块写入原始字节，恰好到达限额可以成功", async () => {
    expect(await writeInspirationUpload(stream([[1,2], [3,4]]), temporaryPath, 4, "超过限额")).toBe(4);
    expect([...await fs.readFile(temporaryPath)]).toEqual([1,2,3,4]);
  });
  it("无论请求声明多少，实际流超过上限均拒绝并清理文件", async () => {
    await expect(writeInspirationUpload(stream([[1,2], [3,4,5]]), temporaryPath, 4, "超过限额")).rejects.toMatchObject({ code: "BAD_REQUEST", message: "超过限额" });
    await expect(fs.stat(temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("传输中断后清理部分文件", async () => {
    let step = 0;
    const input = new ReadableStream<Uint8Array>({ pull(controller) { if (step++ === 0) controller.enqueue(new Uint8Array([1,2])); else controller.error(new Error("上传中断")); } });
    await expect(writeInspirationUpload(input, temporaryPath, 10, "超过限额")).rejects.toThrow("上传中断");
    await expect(fs.stat(temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("空文件也拒绝并清理", async () => {
    await expect(writeInspirationUpload(stream([]), temporaryPath, 10, "超过限额")).rejects.toMatchObject({ code: "BAD_REQUEST", message: "文件为空" });
    await expect(fs.stat(temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
