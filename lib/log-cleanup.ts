/**
 * 日志归档清理:扫 data/logs/ 下所有文件,删 mtime 超过 90 天的。
 * 由 instrumentation.ts 注册的 cron(每天 03:00 北京时间)调用。
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const LOG_DIR_REL = "data/logs";
const RETAIN_DAYS = 90;

export async function cleanupOldLogs(): Promise<{ scanned: number; deleted: number }> {
  const dir = path.join(process.cwd(), LOG_DIR_REL);
  let scanned = 0;
  let deleted = 0;

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return { scanned: 0, deleted: 0 }; // 目录不存在直接返回
  }

  const cutoff = Date.now() - RETAIN_DAYS * 24 * 3600 * 1000;
  for (const name of entries) {
    const abs = path.join(dir, name);
    try {
      const stat = await fs.stat(abs);
      if (!stat.isFile()) continue;
      scanned++;
      if (stat.mtimeMs < cutoff) {
        await fs.unlink(abs);
        deleted++;
      }
    } catch {
      // 忽略单个文件错误,继续扫
    }
  }

  if (deleted > 0) console.info(`[log-cleanup] scanned=${scanned} deleted=${deleted}`);
  return { scanned, deleted };
}
