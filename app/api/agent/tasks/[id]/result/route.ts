/**
 * POST /api/agent/tasks/[id]/result — agent 上报任务执行结果(终止状态)。
 *
 * 鉴权:Bearer <agentId>.<secret>
 * Body:multipart/form-data
 *   - status:      "success" | "failure"   (必填)
 *   - exitCode:    stringified int(可选;子进程退出码)
 *   - errorMessage: string(可选;失败原因或警告)
 *   - csvTypes:    JSON array string,与 files 一一对应,每项是该文件的 csvType
 *   - files:       multipart 文件字段,可重复;按 csvTypes 数组顺序与之配对
 *
 * 重构后:废抢占式 + 单次执行(无 attempt 重试)
 *   - 任务必须由当前 agent RUNNING(claim 自该 agent)
 *   - status=failure → FAILED(不重试,管理员可手动 PATCH PENDING 或运营走 rerun 复制新 task)
 *   - status=success → 落多份 CSV(每份对应一个 csvType)→ 跑 parser/snapshot → SUCCEEDED
 *   - 即使 files 为空也合法(success 的脚本可能完全不产生入库产物,飞书发完就结束)
 *
 * 落盘位置:data/raw/<csvType>/<datasetId>.csv(项目根,不在 public/)
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAgent } from "@/lib/agent-auth";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { getParser, getSnapshotter } from "@/lib/parsers";

export const runtime = "nodejs";

const MAX_CSV_BYTES = 200 * 1024 * 1024; // 单文件 200 MB
const UNCATEGORIZED_DIR = "_uncategorized"; // csvType=null 时落盘的子目录
const MAX_STORE_NAME_LEN = 180;

/**
 * 清理 agent 上报的文件名,变成可安全落盘的名字。
 * - 剥掉路径分量(只留 basename),防 `..` / 绝对路径穿越
 * - 去掉控制字符和 Windows 保留字符 < > : " | ? *
 * - 限长 180
 * - 全空 / 全 . 视为无效返回 null
 */
function sanitizeFileName(name: string | null): string | null {
  if (!name) return null;
  // 同时按正反斜杠取 basename
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\x00-\x1f<>:"|?*]/g, "")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, MAX_STORE_NAME_LEN);
  if (!cleaned || cleaned === "." || cleaned === "..") return null;
  return cleaned;
}

/**
 * 决定写到磁盘上的最终文件名:
 *   1. fileName 无效 → 用 `${datasetId}.csv`
 *   2. fileName 有效但目录里已有同名 → 在 stem 后追加 `__<8charId>`
 *   3. fileName 有效且不撞名 → 直接用
 */
async function pickStoreName(
  dir: string,
  fileName: string | null,
  datasetId: string,
): Promise<string> {
  const safe = sanitizeFileName(fileName);
  if (!safe) return `${datasetId}.csv`;
  const target = path.join(dir, safe);
  try {
    await fs.access(target);
    // 撞名:加 datasetId 短码保唯一
    const ext = path.extname(safe);
    const stem = ext ? safe.slice(0, -ext.length) : safe;
    return `${stem}__${datasetId.slice(0, 8)}${ext || ".csv"}`;
  } catch {
    return safe;
  }
}

type DatasetSummary = {
  csvType: string | null;
  datasetId: string;
  parsed: boolean;
  rowCount: number | null;
  parseError: string | null;
  snapshotCount: number | null;
};

export const POST = route(async (req, { params }) => {
  const agent = await requireAgent(req);
  const taskId = params?.id ?? "";
  if (!taskId) throw badRequest("缺少任务 id");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("请求体必须是 multipart/form-data");
  }

  const status = form.get("status");
  if (status !== "success" && status !== "failure") {
    throw badRequest("status 必须是 success / failure");
  }
  const errorMessage = (form.get("errorMessage") as string | null)?.slice(0, 2000) ?? null;
  const exitCodeRaw = form.get("exitCode");
  const exitCode =
    typeof exitCodeRaw === "string" && /^-?\d+$/.test(exitCodeRaw)
      ? parseInt(exitCodeRaw, 10)
      : null;

  const task = await prisma.crawlerTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      status: true,
      agentId: true,
      paramValues: true,
      job: { select: { outputs: true } },
    },
  });
  if (!task) throw notFound("任务不存在");
  if (task.agentId !== agent.id) throw conflict("任务不属于当前 agent");
  if (task.status !== "RUNNING") throw conflict("任务当前状态不可上报结果");

  // parser 上下文用的 paramValues:cron 自动 / 历史 task 可能是 null,统一成 {}
  const taskParamValues =
    task.paramValues && typeof task.paramValues === "object" && !Array.isArray(task.paramValues)
      ? (task.paramValues as Record<string, unknown>)
      : {};

  // 按 csvType 取 filter 树。
  // 同 csvType 多个 output 的情况:取第一个有 filterRoot 的(通常每 csvType 只 1 个 output)。
  // 向后兼容老的 filters: Filter[] 字段 → 包成 { combinator: "AND", items: filters }。
  type RawLeaf = { column: string; operator: string; value?: string | number };
  type RawNode = RawLeaf | { combinator: "AND" | "OR"; items: RawNode[] };
  const filterRootByCsvType = new Map<string, RawNode | null>();
  const rawOutputs = Array.isArray(task.job?.outputs)
    ? (task.job.outputs as Array<{
        path?: string;
        csvType?: string;
        filters?: RawLeaf[]; // 旧字段(已废,留兼容)
        filterRoot?: RawNode;
      }>)
    : [];
  for (const o of rawOutputs) {
    if (!o?.csvType) continue;
    if (filterRootByCsvType.has(o.csvType)) continue; // 已取到首个
    if (o.filterRoot) {
      filterRootByCsvType.set(o.csvType, o.filterRoot);
    } else if (Array.isArray(o.filters) && o.filters.length > 0) {
      // 旧数据格式:flat 数组按 AND 包装
      filterRootByCsvType.set(o.csvType, {
        combinator: "AND",
        items: o.filters,
      });
    } else {
      filterRootByCsvType.set(o.csvType, null);
    }
  }

  // ── 失败:直接 FAILED,不入库 ─────────────────────
  if (status === "failure") {
    await prisma.crawlerTask.update({
      where: { id: task.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        exitCode,
        errorMessage,
      },
    });
    return Response.json({ ok: true, status: "FAILED" });
  }

  // ── 成功:解析 csvTypes / files 配对 ──────────────
  // csvTypes 数组项允许为 string 或 null:
  //   - 非空字符串:有归类,后续会查 parser/snapshotter
  //   - null / 空字符串:仅留底 + 数据集页可下载,不入解析层
  const csvTypesRaw = (form.get("csvTypes") as string | null) ?? "[]";
  let csvTypes: (string | null)[];
  try {
    const parsed = JSON.parse(csvTypesRaw);
    if (!Array.isArray(parsed)) {
      throw new Error("csvTypes 必须是数组");
    }
    csvTypes = parsed.map((s: unknown) =>
      typeof s === "string" && s.length > 0 ? s : null,
    );
  } catch {
    throw badRequest("csvTypes 必须是合法 JSON 数组(项为 string 或 null)");
  }

  const fileEntries = form.getAll("files").filter((v): v is File => v instanceof File);
  if (fileEntries.length !== csvTypes.length) {
    throw badRequest(
      `files 数量(${fileEntries.length})与 csvTypes 数量(${csvTypes.length})不一致`,
    );
  }
  for (const f of fileEntries) {
    if (f.size > MAX_CSV_BYTES) throw badRequest(`CSV 超过 200 MB:${f.name}`);
  }

  const summaries: DatasetSummary[] = [];

  // 逐个 CSV 落盘 + 建 RawDataset
  for (let i = 0; i < fileEntries.length; i++) {
    const file = fileEntries[i];
    const csvType = csvTypes[i]; // string 或 null
    const buf = Buffer.from(await file.arrayBuffer());
    const datasetId = crypto.randomUUID();
    // csvType=null 时落到 _uncategorized/ 文件夹,跟正式入库类隔离
    const csvTypeDir = csvType ?? UNCATEGORIZED_DIR;
    const dir = path.join(process.cwd(), "data", "raw", csvTypeDir);
    await fs.mkdir(dir, { recursive: true });

    // 文件名优先用 agent 上报的原始名;非法 / 缺失 / 撞名时用 datasetId 兜底
    const fileName = typeof file.name === "string" ? file.name : null;
    const storeName = await pickStoreName(dir, fileName, datasetId);
    const storagePath = path.posix.join("data", "raw", csvTypeDir, storeName);
    await fs.writeFile(path.join(dir, storeName), buf);

    const contentHash = crypto.createHash("sha256").update(buf).digest("hex");

    await prisma.rawDataset.create({
      data: {
        id: datasetId,
        // schema 已改为可空,但 prisma client 类型在 db:generate 之后才更新
        csvType: csvType as string,
        taskId: task.id,
        fileName,
        fileSize: buf.byteLength,
        contentHash,
        storagePath,
        uploadedById: agent.id,
      },
    });

    // 跑 parser(只在 csvType 非空 + 有注册时跑;否则只留底)
    let parsedRowCount: number | null = null;
    let parseError: string | null = null;
    let snapshotCount: number | null = null;

    const parser = csvType ? getParser(csvType) : null;
    if (parser) {
      try {
        const filterRoot = csvType ? (filterRootByCsvType.get(csvType) ?? null) : null;
        const result = await parser(buf.toString("utf8"), {
          datasetId,
          paramValues: taskParamValues,
          // RawNode → FilterNode 结构兼容;Zod 已挡;此处直接当 FilterNode 用
          filterRoot: filterRoot as import("@/lib/parsers/csv-helpers").FilterNode | null,
        });
        parsedRowCount = result.rowCount;
      } catch (err) {
        parseError =
          err instanceof Error
            ? err.message.slice(0, 2000)
            : String(err).slice(0, 2000);
      }
    }

    if (parseError === null) {
      const snapshotter = csvType ? getSnapshotter(csvType) : null;
      if (snapshotter) {
        try {
          snapshotCount = await snapshotter(datasetId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          parseError = `[snapshot 失败] ${msg}`.slice(0, 2000);
        }
      }
    }

    // 只在 parser 真的跑过且成功时才标 parsedAt;
    // csvType=null 或没有注册 parser 时,parsedAt 留 null,UI 显示「未分类」
    const parserRan = parser !== null;
    await prisma.rawDataset.update({
      where: { id: datasetId },
      data: {
        parsedAt: parserRan && parseError === null ? new Date() : null,
        rowCount: parsedRowCount,
        parseError,
      },
    });

    summaries.push({
      csvType,
      datasetId,
      parsed: parserRan && parseError === null,
      rowCount: parsedRowCount,
      parseError,
      snapshotCount,
    });
  }

  await prisma.crawlerTask.update({
    where: { id: task.id },
    data: {
      status: "SUCCEEDED",
      finishedAt: new Date(),
      exitCode,
      errorMessage: errorMessage,
    },
  });

  return Response.json({
    ok: true,
    status: "SUCCEEDED",
    datasets: summaries,
  });
});
