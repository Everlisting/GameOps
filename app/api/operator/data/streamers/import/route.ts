/**
 * POST /api/operator/data/streamers/import — 运营导入「主播名单」。
 *
 * 主播数据页的名单来源(为主),独立于视频/直播明细,保证「本月没发作品的主播也在名单内」。
 * 按 (platform, uid) upsert 到 AnchorStat,只写身份 + 花名册字段(缺列不冲空);
 * 数值指标由页面按 UID 实时聚合明细表,不在此落库。
 *
 * 鉴权:OPERATOR 起。Body:multipart/form-data,字段 `file`(.csv / .xlsx / .xls)。
 * 流程与视频导入一致(留底 RawDataset + parser),但 csvType=anchor_roster、无 snapshotter。
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

const CSV_TYPE = "anchor_roster";
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
    fileName: original,
  });
});
