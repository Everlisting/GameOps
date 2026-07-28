/**
 * Next.js 进程级初始化钩子(experimental.instrumentationHook=true 后生效)。
 *
 * 仅在 Node runtime 注册后台 worker(cron 调度、日志清理、日报、下载器、索引器、飞书长连接);
 * Edge runtime 不会跑这段。所有启动/失败与每次 tick 走结构化 worker 日志(见 docs/logging.md §4.5/§7)。
 */
import { createLogger, runWithLogContext } from "@/lib/logger";

const log = createLogger("worker");

/** 启动一个后台 worker,统一记录 started / start_failed。 */
async function startWorker(name: string, start: () => void | Promise<void>): Promise<void> {
  try {
    await start();
    log.info(`worker 已启动:${name}`, { event: "worker.started", worker: name });
  } catch (err) {
    log.error(`worker 启动失败:${name}`, { event: "worker.start_failed", worker: name, err });
  }
}

/** 把一次 cron tick 包进独立 traceId,统一记录完成 / 失败。 */
function scheduleTick(name: string, run: () => Promise<unknown>): () => void {
  return () => {
    runWithLogContext({ traceId: crypto.randomUUID() }, () => {
      void run()
        .then(() => log.info(`定时任务完成:${name}`, { event: "worker.tick.done", worker: name }))
        .catch((err) => log.error(`定时任务失败:${name}`, { event: "worker.tick.failed", worker: name, err }));
    });
  };
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // 跳过 build / lint / typecheck 阶段(不需要副作用)
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  await startWorker("cron-scheduler", async () => {
    const { start } = await import("@/lib/cron-scheduler");
    await start();
  });

  // 90 天日志清理(每天 03:00 北京时间);创作者对话保留 1 月清理(03:30)
  await startWorker("cron-jobs", async () => {
    const { default: cron } = await import("node-cron");
    const { cleanupOldLogs } = await import("@/lib/log-cleanup");
    cron.schedule("0 3 * * *", scheduleTick("log-cleanup", cleanupOldLogs), {
      scheduled: true,
      timezone: "Asia/Shanghai",
    });

    const { cleanupOldCreatorChats } = await import("@/lib/assistant/retention");
    cron.schedule("30 3 * * *", scheduleTick("creator-chat-retention", cleanupOldCreatorChats), {
      scheduled: true,
      timezone: "Asia/Shanghai",
    });

    // 阶段6 · 飞书运营数据日报:每天 09:00 北京时间推送到已勾选「日报」的群
    const { sendDailyReportToAll, SYSTEM_FEISHU_ACTOR } = await import("@/lib/feishu/send");
    cron.schedule("0 9 * * *", scheduleTick("feishu-daily-report", () => sendDailyReportToAll(SYSTEM_FEISHU_ACTOR)), {
      scheduled: true,
      timezone: "Asia/Shanghai",
    });
  });

  // 阶段9 · 舆情监控:每 10s 拉分析服务的 DONE 报告落中台 storage
  await startWorker("opinion-downloader", async () => {
    const { startDownloader } = await import("@/lib/opinion/downloader");
    startDownloader();
  });

  // 阶段10.3 · 知识库:后台异步索引 worker(解析/OCR/嵌入)
  await startWorker("kb-indexer", async () => {
    const { startIndexer } = await import("@/lib/assistant/indexer");
    startIndexer();
  });

  // 阶段6 · 飞书双向对话:长连接(WebSocket)接收消息事件 → 只读 Agent → 回发
  await startWorker("feishu-ws", async () => {
    const { startFeishuWS } = await import("@/lib/feishu/ws");
    startFeishuWS();
  });
}
