/**
 * GET /api/operator/datasets/[id]/download — 下载原始 CSV
 *
 * 鉴权:OPERATOR
 * 安全:
 *   - 落盘路径来自 DB(RawDataset.storagePath),不接受外部传入
 *   - 解析后做一次"是否仍在 data/raw/" 校验,防止历史脏数据指到任意路径
 *   - 文件名走 RFC 5987 编码,避免中文名乱码
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { handleApiError } from "@/lib/api";
import { badRequest, notFound } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params?: Record<string, string> },
) {
  try {
    await requireRole("OPERATOR");
    const id = ctx.params?.id ?? "";

    const ds = await prisma.rawDataset.findUnique({
      where: { id },
      select: {
        id: true,
        csvType: true,
        fileName: true,
        fileSize: true,
        storagePath: true,
      },
    });
    if (!ds) throw notFound("数据集不存在");

    const root = process.cwd();
    const allowedRoot = path.resolve(root, "data", "raw");
    const abs = path.resolve(root, ds.storagePath);
    // 防越权:解析后路径必须仍在 data/raw 之下
    if (!abs.startsWith(allowedRoot + path.sep) && abs !== allowedRoot) {
      throw badRequest("数据集存储路径异常");
    }

    let buf: Buffer;
    try {
      buf = await fs.readFile(abs);
    } catch {
      throw notFound("文件已不存在(可能被清理)");
    }

    const baseName = ds.fileName ?? `${ds.csvType}-${ds.id}.csv`;
    const safeAscii = baseName.replace(/[^\x20-\x7E]/g, "_");
    const encoded = encodeURIComponent(baseName);
    const cd = `attachment; filename="${safeAscii}"; filename*=UTF-8''${encoded}`;

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Length": String(buf.byteLength),
        "Content-Disposition": cd,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
