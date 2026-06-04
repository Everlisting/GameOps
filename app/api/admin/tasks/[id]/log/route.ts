/**
 * GET /api/admin/tasks/[id]/log — 读任务执行日志
 *
 * 鉴权:OPERATOR(运营 + 管理员)
 *
 * Query 参数(三选一,均省略 = 返回全部,上限 5MB):
 *   - offset=N        从字节 N 开始读(UI 增量 tail 用)
 *   - tail=N          只返回末尾 N 字节(UI 默认仅展示尾 100 行)
 *   - lines=N         只返回末尾 N 行(便于 UI 默认折叠)
 *   - download=1      Content-Disposition: attachment,作为下载触发
 *
 * 响应:
 *   - Content-Type: text/plain; charset=utf-8
 *   - X-Log-Size: 当前文件总字节数
 *   - X-Log-Status: PENDING / RUNNING / SUCCEEDED / FAILED / CANCELED(UI 决定是否继续轮询)
 */
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { badRequest, notFound } from "@/lib/errors";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 单次响应上限 5MB
const MAX_TAIL_LINES_SCAN_BYTES = 2 * 1024 * 1024; // 行模式下最多扫这么多字节往前找换行

/** 给定缓冲区,只保留末尾 N 行(以 \n 分割)。N=0 视为不限。 */
function keepLastNLines(buf: Buffer, n: number): Buffer {
  if (n <= 0) return buf;
  let count = 0;
  for (let i = buf.length - 1; i >= 0; i--) {
    if (buf[i] === 0x0a) {
      count++;
      // 当行尾换行(\n)凑齐 n+1 个,说明前面已包含 n 行完整内容
      if (count > n) return buf.subarray(i + 1);
    }
  }
  return buf; // 不够 n 行就返全文
}

export const GET = route(async (req, { params }) => {
  await requireRole("OPERATOR");
  const id = params?.id ?? "";

  const task = await prisma.crawlerTask.findUnique({
    where: { id },
    select: { id: true, status: true, logPath: true },
  });
  if (!task) throw notFound("任务不存在");

  if (!task.logPath) {
    return new Response("", {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Log-Size": "0",
        "X-Log-Status": task.status,
      },
    });
  }

  const abs = resolve(process.cwd(), task.logPath);
  // 防御:路径越界(logPath 应该是 data/logs/<id>.log)
  if (!abs.startsWith(resolve(process.cwd(), "data/logs"))) {
    throw badRequest("日志路径非法");
  }

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(abs);
  } catch {
    return new Response("", {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Log-Size": "0",
        "X-Log-Status": task.status,
      },
    });
  }
  const size = stat.size;

  const url = new URL(req.url);
  const offsetStr = url.searchParams.get("offset");
  const tailStr = url.searchParams.get("tail");
  const linesStr = url.searchParams.get("lines");
  const isDownload = url.searchParams.get("download") === "1";

  let start = 0;
  let end = size;
  if (offsetStr !== null) {
    start = Math.max(0, Math.min(size, parseInt(offsetStr, 10) || 0));
  } else if (tailStr !== null) {
    const tail = Math.max(0, parseInt(tailStr, 10) || 0);
    start = Math.max(0, size - tail);
  } else if (linesStr !== null) {
    // 行模式:倒着读最多 2 MB,在 buffer 里数 \n,再裁到 N 行
    const scanBytes = Math.min(size, MAX_TAIL_LINES_SCAN_BYTES);
    start = Math.max(0, size - scanBytes);
  } else if (isDownload) {
    // 下载模式不截断(仍受 MAX_RESPONSE_BYTES 整体限制)
    start = Math.max(0, size - MAX_RESPONSE_BYTES);
  } else {
    // 全量;超过上限时截到末尾
    if (size > MAX_RESPONSE_BYTES) start = size - MAX_RESPONSE_BYTES;
  }

  if (end - start > MAX_RESPONSE_BYTES) {
    end = start + MAX_RESPONSE_BYTES;
  }

  const fh = await fs.open(abs, "r");
  try {
    let buf: Buffer = Buffer.alloc(end - start);
    if (end > start) await fh.read(buf, 0, end - start, start);

    // 行模式:在缓冲区里再裁到 N 行
    if (linesStr !== null) {
      const n = Math.max(0, parseInt(linesStr, 10) || 0);
      buf = keepLastNLines(buf, n);
    }

    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Log-Size": String(size),
      "X-Log-Status": task.status,
    };
    if (isDownload) {
      headers["Content-Disposition"] = `attachment; filename="task-${id}.log"`;
      headers["Cache-Control"] = "private, no-cache";
    }
    return new Response(new Uint8Array(buf), { headers });
  } finally {
    await fh.close();
  }
});
