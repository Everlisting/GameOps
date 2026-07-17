/**
 * POST /api/operator/data/videos/import — 运营手动导入「抖音视频明细表」。
 *
 * 与爬虫 agent 上报走的是同一份 CSV、同一个 parser(douyin_video_detail),
 * 只是改成人工在「视频数据」页直接上传,用于补录 / 回填历史,不经过 Job/Task。
 *
 * 鉴权:OPERATOR 起(与视频数据页一致)。
 * Body:multipart/form-data,单个字段 `file`(.csv / .xlsx / .xls)。
 *
 * 流程(镜像 app/api/agent/tasks/[id]/result 的单文件分支):
 *   1. 落盘到 data/raw/douyin_video_detail/<name>__<id>.<ext>(留底,可在数据集页下载)
 *   2. 建 RawDataset(taskId=null,uploadedById=当前运营)
 *   3. 跑 parser → VideoStat 明细层 upsert;再跑 snapshotter → 当日快照
 *   4. 结果写回 RawDataset.rowCount/parsedAt/parseError,并记一条 data.import 审计
 *   解析失败(如缺列)→ 记录已留底,返回 400 带错误原因。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { badRequest } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { getParser, getSnapshotter } from "@/lib/parsers";

export const runtime = "nodejs";

const CSV_TYPE = "douyin_video_detail";
const MAX_BYTES = 200 * 1024 * 1024; // 与 agent 上报同上限
const MAX_STEM_LEN = 120;

/** 解析「数据所属日期」表单字段(YYYY-MM-DD → @db.Date 用的 UTC 零点 Date)。
 *  空 → undefined(交给 snapshotter 用今天兜底);格式非法 → 400。 */
function parseDataDate(raw: FormDataEntryValue | null): Date | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) throw badRequest("数据日期格式应为 YYYY-MM-DD");
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(dt.getTime())) throw badRequest("数据日期非法");
  return dt;
}

/** 取上传文件名的 stem(去扩展名)并清成可安全落盘的形式。 */
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

  // 数据所属日期(快照落到这一天);常是 T-1。缺省 → snapshotter 用北京时间今天兜底。
  const dataDate = parseDataDate(form.get("dataDate"));

  const original = typeof file.name === "string" && file.name ? file.name : "import.csv";
  const lower = original.toLowerCase();
  const isExcel = lower.endsWith(".xlsx") || lower.endsWith(".xls");
  const raw = Buffer.from(await file.arrayBuffer());

  // parser 只吃 CSV 文本;Excel 先转成 CSV(原始字节仍按原样留底)
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

  // ── 跑 parser + snapshotter(与 agent result 路由同逻辑)──────────
  let rowCount: number | null = null;
  let hiddenCount: number | null = null;
  let parseError: string | null = null;
  let snapshotCount: number | null = null;

  const parser = getParser(CSV_TYPE);
  if (parser) {
    try {
      const result = await parser(csvText, {
        datasetId,
        paramValues: {},
        filterRoot: null,
      });
      rowCount = result.rowCount;
      hiddenCount = result.hiddenCount ?? 0;
    } catch (err) {
      parseError =
        err instanceof Error
          ? err.message.slice(0, 2000)
          : String(err).slice(0, 2000);
    }
  }

  if (parseError === null) {
    const snapshotter = getSnapshotter(CSV_TYPE);
    if (snapshotter) {
      try {
        snapshotCount = await snapshotter(datasetId, dataDate);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        parseError = `[snapshot 失败] ${msg}`.slice(0, 2000);
      }
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
      hiddenCount,
      dataDate: dataDate ? dataDate.toISOString().slice(0, 10) : null,
      parseError,
    },
  });

  if (parseError) {
    // 已留底(RawDataset 记录保留),但没能入明细层 → 400 带原因
    throw badRequest(`解析失败:${parseError}`);
  }

  return Response.json({
    ok: true,
    datasetId,
    rowCount: rowCount ?? 0,
    hiddenCount: hiddenCount ?? 0,
    snapshotCount: snapshotCount ?? 0,
    dataDate: dataDate ? dataDate.toISOString().slice(0, 10) : null,
    fileName: original,
  });
});
