/**
 * POST /api/operator/data/live/import — 运营导入「直播明细表」(所有主播画像表)。
 *
 * 粒度:主播 × 自然日。按 (platform, uid, date) upsert 到 LiveStat;只入库开播时长>0 的行。
 * 与爬虫上报(Job outputs csvType=live_detail)共用同一 parser。
 *
 * 鉴权:OPERATOR 起。Body:multipart/form-data,字段 `file`(.csv / .xlsx / .xls)。
 * 流程与视频/名单导入一致(留底 RawDataset + parser),csvType=live_detail、无 snapshotter。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { badRequest } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { getParser } from "@/lib/parsers";

export const runtime = "nodejs";

const CSV_TYPE = "live_detail";
const MAX_BYTES = 200 * 1024 * 1024;
const MAX_STEM_LEN = 120;

function sanitizeStem(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const noExt = base.replace(/\.[^.]+$/, "");
  const cleaned = noExt
    .replace(/[\x00-\x1f<>:"|?*]/g, "")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, MAX_STEM_LEN);
  return cleaned || "import";
}

export const POST = route(async (req) => {
  const session = await requireRole("OPERATOR");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("请求体必须是 multipart/form-data");
  }

  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("缺少上传文件 file");
  if (file.size === 0) throw badRequest("文件为空");
  if (file.size > MAX_BYTES) throw badRequest("文件超过 200 MB");

  const original = typeof file.name === "string" && file.name ? file.name : "import.csv";
  const lower = original.toLowerCase();
  const isExcel = lower.endsWith(".xlsx") || lower.endsWith(".xls");
  const raw = Buffer.from(await file.arrayBuffer());

  let csvText: string;
  if (isExcel) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(raw, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw badRequest("Excel 文件中没有 sheet");
    csvText = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
  } else {
    csvText = raw.toString("utf8");
  }

  const datasetId = crypto.randomUUID();
  const ext = isExcel ? path.extname(lower) || ".xlsx" : ".csv";
  const storeName = `${sanitizeStem(original)}__${datasetId.slice(0, 8)}${ext}`;
  const dir = path.join(process.cwd(), "data", "raw", CSV_TYPE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, storeName), raw);
  const storagePath = path.posix.join("data", "raw", CSV_TYPE, storeName);
  const contentHash = crypto.createHash("sha256").update(raw).digest("hex");

  await prisma.rawDataset.create({
    data: {
      id: datasetId,
      csvType: CSV_TYPE,
      taskId: null,
      fileName: original,
      fileSize: raw.byteLength,
      contentHash,
      storagePath,
      uploadedById: session.sub,
    },
  });

  let rowCount: number | null = null;
  let skippedCount: number | null = null;
  let parseError: string | null = null;

  const parser = getParser(CSV_TYPE);
  if (parser) {
    try {
      const result = await parser(csvText, {
        datasetId,
        paramValues: {},
        filterRoot: null,
      });
      rowCount = result.rowCount;
      skippedCount = result.skippedCount ?? 0;
    } catch (err) {
      parseError =
        err instanceof Error ? err.message.slice(0, 2000) : String(err).slice(0, 2000);
    }
  }

  await prisma.rawDataset.update({
    where: { id: datasetId },
    data: {
      parsedAt: parseError === null ? new Date() : null,
      rowCount,
      parseError,
    },
  });

  await recordAudit({
    actorId: session.sub,
    actorUsername: session.username,
    action: "data.import",
    targetType: "dataset",
    targetId: datasetId,
    details: {
      csvType: CSV_TYPE,
      fileName: original,
      fileSize: raw.byteLength,
      rowCount,
      skippedCount,
      parseError,
    },
  });

  if (parseError) {
    throw badRequest(`解析失败:${parseError}`);
  }

  return Response.json({
    ok: true,
    datasetId,
    rowCount: rowCount ?? 0,
    skippedCount: skippedCount ?? 0,
    fileName: original,
  });
});
