/**
 * 阶段10.3 · 知识库 · 后台异步索引 worker。
 *
 * 进程启动时 instrumentation.ts 调 startIndexer();每 POLL_MS 扫 status=pending 的文档,
 * 读原文件 → 解析(含 OCR)→ 切块 → 嵌入 → 入库。重活全在这里,不阻塞上传请求。
 * 并发保护:单进程 running 标志;每轮处理少量,避免打爆嵌入端点。
 */
import path from "node:path";

import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { readKbFile } from "@/lib/assistant/kb-storage";
import { extractText } from "@/lib/assistant/parse";
import { ingestKnowledgeVersion } from "@/lib/assistant/rag";
import { knowledgeContentChecksum } from "@/lib/assistant/knowledge-version";

const log = createLogger("kb.indexer");

const POLL_MS = 5_000;
const BATCH = 2; // 每轮最多处理 2 个文档

let started = false;
let running = false;
let timer: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    // 上传原件首次解析：把规范化正文保存为 v1，之后索引永远只读版本表正文。
    const unparsed = await prisma.knowledgeDocument.findMany({
      where: {
        status: "pending",
        storagePath: { not: null },
        versions: { none: {} },
      },
      orderBy: { createdAt: "asc" },
      take: BATCH,
      select: { id: true, kbId: true, mimeType: true, storagePath: true },
    });
    for (const d of unparsed) {
      if (!d.storagePath) continue;
      try {
        await prisma.knowledgeDocument.update({
          where: { id: d.id },
          data: { status: "indexing", error: null },
        });
        const buf = await readKbFile(d.storagePath);
        const text = await extractText(buf, path.basename(d.storagePath), d.mimeType);
        if (!text) {
          await prisma.knowledgeDocument.update({
            where: { id: d.id },
            data: { status: "failed", error: "未解析到文本(空文档或扫描件 OCR 无结果)" },
          });
          continue;
        }
        await prisma.$transaction([
          prisma.knowledgeDocumentVersion.create({
            data: {
              documentId: d.id,
              version: 1,
              content: text,
              format: "markdown",
              status: "pending",
              checksum: knowledgeContentChecksum(text),
            },
          }),
          prisma.knowledgeDocument.update({
            where: { id: d.id },
            data: { status: "pending", error: null },
          }),
        ]);
      } catch (err) {
        await prisma.knowledgeDocument
          .update({
            where: { id: d.id },
            data: {
              status: "failed",
              error: err instanceof Error ? err.message.slice(0, 300) : String(err),
            },
          })
          .catch(() => {});
      }
    }

    // 已有文档从不可变原件重建规范化正文，避免从带 overlap 的历史 chunks 反向拼接。
    const parsingVersions = await prisma.knowledgeDocumentVersion.findMany({
      where: { status: "parsing" },
      orderBy: { createdAt: "asc" },
      take: BATCH,
      select: {
        id: true,
        documentId: true,
        document: {
          select: { mimeType: true, storagePath: true, publishedVersionId: true },
        },
      },
    });
    for (const version of parsingVersions) {
      const claimed = await prisma.knowledgeDocumentVersion.updateMany({
        where: { id: version.id, status: "parsing" },
        data: { status: "indexing", error: null },
      });
      if (claimed.count !== 1) continue;
      try {
        if (!version.document.storagePath) throw new Error("文档原件不存在，无法重新解析");
        const buffer = await readKbFile(version.document.storagePath);
        const text = await extractText(
          buffer,
          path.basename(version.document.storagePath),
          version.document.mimeType,
        );
        if (!text) throw new Error("未解析到文本(空文档或扫描件 OCR 无结果)");
        await prisma.knowledgeDocumentVersion.update({
          where: { id: version.id },
          data: {
            content: text,
            checksum: knowledgeContentChecksum(text),
            status: "pending",
            error: null,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message.slice(0, 300) : String(err);
        await prisma.knowledgeDocumentVersion
          .update({ where: { id: version.id }, data: { status: "failed", error: message } })
          .catch(() => {});
        if (!version.document.publishedVersionId) {
          await prisma.knowledgeDocument
            .update({ where: { id: version.documentId }, data: { status: "failed", error: message } })
            .catch(() => {});
        }
      }
    }

    const pendingVersions = await prisma.knowledgeDocumentVersion.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      take: BATCH,
      select: {
        id: true,
        documentId: true,
        content: true,
        document: { select: { kbId: true, publishedVersionId: true } },
      },
    });
    for (const version of pendingVersions) {
      const claimed = await prisma.knowledgeDocumentVersion.updateMany({
        where: { id: version.id, status: "pending" },
        data: { status: "indexing", error: null },
      });
      if (claimed.count !== 1) continue;
      try {
        if (!version.document.publishedVersionId) {
          await prisma.knowledgeDocument.update({
            where: { id: version.documentId },
            data: { status: "indexing", error: null },
          });
        }
        await ingestKnowledgeVersion(
          version.id,
          version.documentId,
          version.document.kbId,
          version.content,
        );
      } catch (err) {
        log.warn("知识版本索引失败", {
          event: "kb.indexer.version_failed",
          documentId: version.documentId,
          versionId: version.id,
          err,
        });
      }
    }
  } catch (err) {
    log.error("索引轮询失败", { event: "kb.indexer.tick_failed", err });
  } finally {
    running = false;
  }
}

export function startIndexer(): void {
  if (started) return;
  started = true;
  timer = setInterval(() => void tick(), POLL_MS);
  if (timer.unref) timer.unref();
  log.info("索引 worker 已启动", { event: "kb.indexer.started" });
}
