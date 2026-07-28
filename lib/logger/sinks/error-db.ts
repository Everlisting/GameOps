/**
 * ErrorLog sink(可选,LOG_ERROR_DB_ENABLED=true 才启用)。见 docs/logging.md §9/§12。
 *
 * 只接高价值 error/fatal(persist)。隔离有界队列 + 批量写:
 *  - 有界:超 MAX_QUEUE 丢最旧并计数,限频 stderr 摘要;不阻塞主业务。
 *  - 防递归:sink 自身失败只写 bootstrap(stderr),绝不回流 logger/ErrorLog;sinkInternal 记录不入队。
 *  - 批量:每 BATCH 或每 FLUSH_MS 落一次;进程退出信号尽力 flush。
 * Node-only(依赖 prisma/node:crypto);由 lib/logger/index.ts 动态 import(避免与 lib/db 的循环)。
 */
import { createHash } from "node:crypto";

import { bootstrapLog } from "@/lib/logger/bootstrap";
import { errorLogDb } from "@/lib/logger/error-log-db";

export interface PersistInput {
  occurredAt: string; // ts (UTC ISO)
  level: string;
  service: string;
  environment: string;
  release?: string;
  instanceId?: string;
  module: string;
  event?: string;
  msg: string;
  requestId?: string;
  traceId?: string;
  taskId?: string;
  runId?: string;
  userIdHash?: string;
  err?: { name?: string; message?: string; code?: string; stack?: string };
  fields?: Record<string, unknown>;
}

const MAX_QUEUE = 1000;
const BATCH = 50;
const FLUSH_MS = 2000;

let queue: Record<string, unknown>[] = [];
let dropped = 0;
let timer: NodeJS.Timeout | null = null;
let flushing = false;

export function isErrorDbEnabled(): boolean {
  return process.env.LOG_ERROR_DB_ENABLED === "true";
}

/** 栈顶帧(用于 fingerprint 区分不同代码位置的同类错误)。 */
function topFrame(stack?: string): string {
  if (!stack) return "";
  const line = stack.split("\n").find((l) => l.trim().startsWith("at "));
  return line ? line.trim().slice(0, 200) : "";
}

/** service+module+event+errName+errCode+topFrame+release → sha256 前 32 位。 */
function fingerprint(input: PersistInput): string {
  const parts = [
    input.service,
    input.module,
    input.event ?? "",
    input.err?.name ?? "",
    input.err?.code ?? "",
    topFrame(input.err?.stack),
    input.release ?? "",
  ].join("|");
  return createHash("sha256").update(parts).digest("hex").slice(0, 32);
}

function toRow(input: PersistInput): Record<string, unknown> {
  return {
    occurredAt: new Date(input.occurredAt),
    level: input.level,
    service: input.service,
    environment: input.environment,
    release: input.release ?? null,
    instanceId: input.instanceId ?? null,
    module: input.module,
    event: input.event ?? null,
    msg: input.msg,
    requestId: input.requestId ?? null,
    traceId: input.traceId ?? null,
    taskId: input.taskId ?? null,
    runId: input.runId ?? null,
    userIdHash: input.userIdHash ?? null,
    errName: input.err?.name ?? null,
    errMessage: input.err?.message ?? null,
    errStack: input.err?.stack ?? null,
    errCode: input.err?.code ?? null,
    fingerprint: fingerprint(input),
    fields: (input.fields as unknown) ?? null,
  };
}

function scheduleFlush(): void {
  if (queue.length >= BATCH) {
    void runFlush();
    return;
  }
  if (!timer) {
    timer = setTimeout(() => void runFlush(), FLUSH_MS);
    timer.unref?.();
  }
}

async function runFlush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.splice(0, BATCH);
  try {
    await errorLogDb.createMany({ data: batch });
  } catch (err) {
    // 防递归:写库失败只落 bootstrap stderr,丢弃该批,绝不回流 logger/ErrorLog
    bootstrapLog("error", "ErrorLog 写入失败,已丢弃该批", {
      count: batch.length,
      err: err instanceof Error ? err.message : String(err),
    });
  } finally {
    flushing = false;
    if (queue.length > 0) scheduleFlush();
  }
}

/** 入队一条高价值错误。非阻塞、绝不抛。 */
export function enqueueErrorLog(input: PersistInput): void {
  try {
    if (queue.length >= MAX_QUEUE) {
      queue.shift(); // 丢最旧,优先保留较新
      dropped++;
      if (dropped % 100 === 1) {
        bootstrapLog("warn", `ErrorLog 队列已满,累计丢弃 ${dropped} 条`, { dropped });
      }
    }
    queue.push(toRow(input));
    scheduleFlush();
  } catch (err) {
    bootstrapLog("error", "ErrorLog 入队失败", { err: err instanceof Error ? err.message : String(err) });
  }
}

// 退出信号尽力 flush 一次(有界,不无限阻塞);只注册一次
let shutdownHooked = false;
function hookShutdown(): void {
  if (shutdownHooked) return;
  shutdownHooked = true;
  const drain = () => {
    void runFlush();
  };
  process.once("SIGTERM", drain);
  process.once("SIGINT", drain);
  process.once("beforeExit", drain);
}
if (isErrorDbEnabled()) hookShutdown();

/** ErrorLog 保留清理:删除 occurredAt 早于 retainDays 的记录。 */
export async function cleanupOldErrorLogs(retainDays = 90): Promise<number> {
  if (!isErrorDbEnabled()) return 0;
  const cutoff = new Date(Date.now() - retainDays * 86_400_000);
  const res = await errorLogDb.deleteMany({ where: { occurredAt: { lt: cutoff } } });
  return res.count;
}
