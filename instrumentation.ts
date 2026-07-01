/**
 * Next.js 进程级初始化钩子(experimental.instrumentationHook=true 后生效)。
 *
 * 仅在 Node runtime 注册 cron 调度器;Edge runtime 不会跑这段。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // 跳过 build / lint / typecheck 阶段(不需要副作用)
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  try {
    const { start } = await import("@/lib/cron-scheduler");
    await start();
  } catch (err) {
    console.error("[instrumentation] cron-scheduler 启动失败", err);
  }

  // 90 天日志清理(每天 03:00 北京时间)
  try {
    const { default: cron } = await import("node-cron");
    const { cleanupOldLogs } = await import("@/lib/log-cleanup");
    cron.schedule(
      "0 3 * * *",
      () => {
        void cleanupOldLogs().catch((err) =>
          console.error("[log-cleanup] 失败", err),
        );
      },
      { scheduled: true, timezone: "Asia/Shanghai" },
    );
  } catch (err) {
    console.error("[instrumentation] log-cleanup 启动失败", err);
  }

  // 阶段9 · 舆情监控:每 10s 拉分析服务的 DONE 报告落中台 storage
  try {
    const { startDownloader } = await import("@/lib/opinion/downloader");
    startDownloader();
  } catch (err) {
    console.error("[instrumentation] opinion.downloader 启动失败", err);
  }
}
