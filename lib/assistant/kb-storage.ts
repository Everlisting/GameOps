/**
 * 阶段10.3 · 知识库 · 原文件留底(本地 storage/knowledge/;上线换 OSS)。
 * 存文件名保留原扩展名,后台 indexer 据此选解析器。
 */
import fs from "node:fs/promises";
import path from "node:path";

const REL_DIR = path.join("storage", "knowledge");

export async function saveKbFile(docId: string, filename: string, buf: Buffer): Promise<string> {
  const ext = path.extname(filename) || "";
  const rel = path.join(REL_DIR, `${docId}${ext}`);
  const abs = path.join(process.cwd(), rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);
  return rel.replace(/\\/g, "/");
}

export async function readKbFile(relPath: string): Promise<Buffer> {
  return fs.readFile(path.join(process.cwd(), relPath));
}

export async function removeKbFile(relPath: string | null | undefined): Promise<void> {
  if (!relPath) return;
  try {
    await fs.unlink(path.join(process.cwd(), relPath));
  } catch {
    /* 文件可能已不在 */
  }
}
