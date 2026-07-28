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
import { ingestDocument } from "@/lib/assistant/rag";

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
    const pending = await prisma.knowledgeDocument.findMany({
      where: { status: "pending", storagePath: { not: null } },
      orderBy: { createdAt: "asc" },
      take: BATCH,
      select: { id: true, kbId: true, mimeType: true, storagePath: true },
    });
    for (const d of pending) {
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
        await ingestDocument(d.id, d.kbId, text);
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
