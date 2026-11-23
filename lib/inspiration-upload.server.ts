import { promises as fs } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { badRequest } from "@/lib/errors";

/** 按实际流量限额写入临时文件，中断/超限/空文件时清理，不整份载入内存。 */
export async function writeInspirationUpload(stream: ReadableStream<Uint8Array>, temporaryPath: string, maxBytes: number, oversizeMessage: string): Promise<number> {
  let size = 0;
  // DOM 与 Node 的 ReadableStream 类型声明不同，运行时均为 Web Stream。
  const input = Readable.fromWeb(stream as NodeReadableStream<Uint8Array>);
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes) callback(badRequest(oversizeMessage));
      else callback(null, chunk);
    },
  });
  const handle = await fs.open(temporaryPath, "wx");
  try {
    await pipeline(input, limiter, handle.createWriteStream());
    if (size === 0) throw badRequest("文件为空");
    return size;
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}
