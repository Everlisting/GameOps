import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable, type PassThrough } from "node:stream";
import { ZipFile } from "yazl";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";
import { inspirationFiles, isStoryInspiration, localInspirationUpload, storyArchiveMedia, type InspirationFileData } from "@/lib/inspiration-files";
import { safeResourceUrl } from "@/lib/inspiration-catalog";

const byteQueue = {
  highWaterMark: 64 * 1024,
  size: (chunk: Uint8Array) => chunk.byteLength,
};

/** 仅解析本站素材路径，拒绝外链、编码路径与跨目录访问。 */
export function inspirationFilePath(url: string): string | null {
  const upload = localInspirationUpload(url);
  return upload ? path.join(upload.kind, upload.filename) : null;
}

function filenameStem(title: string, maxBytes?: number) {
  const cleaned = title.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "_").replace(/^[.\s]+|[.\s]+$/g, "");
  // 为 ZIP 文件名的扩展名和去重编号预留字节，避免解压时超过文件系统限制。
  let shortened = "";
  for (const character of Array.from(cleaned).slice(0, 120)) {
    if (maxBytes !== undefined && Buffer.byteLength(shortened + character) > maxBytes) break;
    shortened += character;
  }
  const stem = Buffer.from(shortened.replace(/[.\s]+$/g, "")).toString("utf8") || "素材";
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem) ? "_" + stem : stem;
}

function downloadHeaders(title: string, extension: string, size?: number): HeadersInit {
  const name = filenameStem(title) + extension;
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return {
    "Content-Type": extension === ".zip" ? "application/zip" : "application/octet-stream",
    "Content-Disposition": `attachment; filename="resource${extension}"; filename*=UTF-8''${encoded}`,
    ...(size === undefined ? {} : { "Content-Length": String(size) }),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

function fileTitle(file: InspirationFileData, extension: string) {
  return extension && file.name.toLowerCase().endsWith(extension.toLowerCase())
    ? file.name.slice(0, -extension.length)
    : file.name;
}

async function resolveInspirationFile(relative: string) {
  try {
    const root = await fs.realpath(path.join(process.cwd(), "public", "uploads", "inspirations"));
    const target = await fs.realpath(path.join(root, relative));
    const resolvedRelative = path.relative(root, target);
    if (resolvedRelative.startsWith("..") || path.isAbsolute(resolvedRelative)) throw notFound("资源文件不存在");
    return target;
  } catch (error) {
    rethrowFileError(error);
  }
}

function rethrowFileError(error: unknown): never {
  if (error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
    throw notFound("资源文件不存在");
  }
  throw error;
}

async function downloadArchive(title: string, files: InspirationFileData[], storyText?: string | null) {
  if (!files.length && !storyText?.trim()) throw notFound("此素材没有可打包的内容");
  type Entry = { name: string; extension: string } & ({ text: string } | { target: string; size: number });

  // 校验所有成员后才发送附件响应，缺失的文件不会生成半截 ZIP。
  const entries = await Promise.all(files.map(async (file): Promise<Entry> => {
    const relative = inspirationFilePath(file.url);
    if (!relative) {
      const url = safeResourceUrl(file.url);
      if (!url || !/^https?:\/\//i.test(url)) throw badRequest("附件链接无效");
      return { name: `${file.name}（外部链接）`, extension: ".txt", text: url + "\n" };
    }
    const target = await resolveInspirationFile(relative);
    const stat = await fs.stat(target).catch(rethrowFileError);
    if (!stat.isFile()) throw notFound("资源文件不存在");
    const extension = path.extname(relative);
    return { name: fileTitle(file, extension), extension, target, size: stat.size };
  }));
  if (storyText?.trim()) {
    entries.push({ name: "故事正文", extension: ".txt", text: storyText });
  }

  const zip = new ZipFile();
  // yazl 实际返回 PassThrough，类型声明仅标注了它的可读接口。
  const output = zip.outputStream as PassThrough;
  let activeFile: Readable | undefined;
  output.once("close", () => activeFile?.destroy());
  zip.on("error", (error: Error) => output.destroy(error));
  const body = Readable.toWeb(output, { strategy: byteQueue }) as ReadableStream<Uint8Array>;
  const names = new Set<string>();
  for (const entry of entries) {
    const stem = filenameStem(entry.name, 220);
    let name = stem + entry.extension;
    for (let index = 2; names.has(name.toLowerCase()); index++) {
      name = `${stem} (${index})${entry.extension}`;
    }
    names.add(name.toLowerCase());

    if ("target" in entry) {
      const target = entry.target;
      // 素材常已压缩，ZIP 直接保存原始字节并按需开启 ZIP64。
      zip.addReadStreamLazy(name, { size: entry.size, compress: false }, (ready) => {
        const stream = createReadStream(target);
        activeFile = stream;
        stream.once("error", (error) => output.destroy(error));
        ready(null, stream);
      });
    } else {
      zip.addBuffer(Buffer.from(entry.text), name);
    }
  }
  zip.end();
  const headers = new Headers(downloadHeaders(title, ".zip"));
  headers.set("X-Accel-Buffering", "no");
  return new Response(body, { headers });
}

export async function downloadPublishedInspiration(id: string, fileId?: string, all = false): Promise<Response> {
  const item = await prisma.inspiration.findFirst({
    where: { id, published: true },
    select: { title: true, url: true, content: true, files: true, type: true, category: true, tags: true, coverImage: true },
  });
  if (!item) throw notFound("资源不存在或尚未发布");
  const files = inspirationFiles(item);
  if (all) {
    if (isStoryInspiration(item)) {
      return downloadArchive(item.title, storyArchiveMedia(item, files), item.content);
    }
    return downloadArchive(item.title, files);
  }
  const selected = fileId ? files.find((file) => file.id === fileId) : files[0];
  if (fileId && !selected) throw notFound("此素材不包含该文件");
  if (!selected && !item.url && item.content) {
    const bytes = new TextEncoder().encode(item.content);
    return new Response(bytes, { headers: downloadHeaders(item.title, ".txt", bytes.byteLength) });
  }
  const url = selected?.url ?? item.url;
  const relative = url ? inspirationFilePath(url) : null;
  if (!relative) throw badRequest("此资源请前往来源网站下载");
  try {
    const target = await resolveInspirationFile(relative);
    const handle = await fs.open(target, "r");
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) throw notFound("资源文件不存在");
      // 使用文件流，下载 1 GB 素材也不将整个文件放入内存。
      const body = Readable.toWeb(handle.createReadStream(), { strategy: byteQueue }) as ReadableStream<Uint8Array>;
      const extension = path.extname(relative);
      const title = selected && selected.id !== "legacy" ? fileTitle(selected, extension) : item.title;
      return new Response(body, { headers: downloadHeaders(title, extension, stat.size) });
    } catch (error) { await handle.close(); throw error; }
  } catch (error) {
    rethrowFileError(error);
  }
}
