/**
 * 阶段9 · 舆情监控 · 后台 worker:拉分析服务的 DONE 报告落中台 storage。
 *
 * 触发方式:进程启动时 instrumentation.ts 调 startDownloader(),每 POLL_INTERVAL_MS
 * 扫一次分析服务 GET /tasks?scope=&status=DONE,对每个未在中台 storage 里的 taskId
 * 拉 HTML + JSON 落盘。
 *
 * 幂等:只看 storage/opinion-reports/<taskId>/index.html 是否存在;并发保护走单进程内的
 * running 标志(不做集群 lock,MVP 单实例)。
 *
 * 出错策略:单个 task 失败只 log,不打断整轮;整轮抛异常也只 log,不停 loop。
 */
import fs from "node:fs/promises";

import { fetchTaskArtifact, listTasks, type AnalysisTaskInfo } from "@/lib/opinion/client";
import {
  ensureRoot,
  ensureTaskDir,
  htmlPath,
  isDownloaded,
  jsonPath,
  metaPath,
} from "@/lib/opinion/storage";
import { env } from "@/lib/validation/env";

const POLL_INTERVAL_MS = 10_000;

let started = false;
let running = false;
let timer: NodeJS.Timeout | null = null;

interface MetaSidecar {
  taskId: string;
  scope: AnalysisTaskInfo["scope"];
  game: string;
  coverageSpan: string | null;
  createdBy: string;
  createdAt: number;
  finishedAt: number | null;
  llmProvider: string | null;
  llmModel: string | null;
  downloadedAt: number;
}

async function downloadOne(task: AnalysisTaskInfo): Promise<void> {
  if (!task.has_html) return; // 分析服务还没写完文件
  if (isDownloaded(task.task_id)) return; // 中台已经落了
  ensureTaskDir(task.task_id);

  // 先 HTML 后 JSON;combined 有可能没 JSON,失败降级为空
  const htmlRes = await fetchTaskArtifact(task.task_id, "html");
  const htmlBuf = Buffer.from(await htmlRes.arrayBuffer());
  await fs.writeFile(htmlPath(task.task_id), htmlBuf);

  if (task.has_json) {
    try {
      const jsonRes = await fetchTaskArtifact(task.task_id, "json");
      const jsonBuf = Buffer.from(await jsonRes.arrayBuffer());
      await fs.writeFile(jsonPath(task.task_id), jsonBuf);
    } catch (err) {
      console.warn("[opinion.downloader] json 拉取失败(html 已入库)", task.task_id, err);
    }
  }

  const meta: MetaSidecar = {
    taskId: task.task_id,
    scope: task.scope,
    game: task.game,
    coverageSpan: task.coverage_span,
    createdBy: task.created_by,
    createdAt: task.created_at,
    finishedAt: task.finished_at,
    llmProvider: task.llm_provider ?? null,
    llmModel: task.llm_model ?? null,
    downloadedAt: Date.now(),
  };
  await fs.writeFile(metaPath(task.task_id), JSON.stringify(meta, null, 2), "utf-8");

  console.info(
    `[opinion.downloader] pulled ${task.scope} ${task.task_id} html=${htmlBuf.length}B`,
  );
}

async function pollOnce(): Promise<void> {
  if (running) return; // 上一轮还没跑完,跳过本轮
  running = true;
  try {
    const list = await listTasks({ status: "DONE", limit: 200 });
    for (const t of list.items) {
      try {
        await downloadOne(t);
      } catch (err) {
        console.warn("[opinion.downloader] 单条失败", t.task_id, err);
      }
    }
  } catch (err) {
    // 分析服务不可达 / 401 等:只 log,下轮再试
    console.warn("[opinion.downloader] 轮询失败", err);
  } finally {
    running = false;
  }
}

/** 由 instrumentation.ts 调,幂等。缺 env 则记 warn 直接返回。 */
export function startDownloader(): void {
  if (started) return;
  if (!env.ANALYSIS_SHARED_SECRET || !env.ANALYSIS_BASE_URL) {
    console.warn(
      "[opinion.downloader] 未配置 ANALYSIS_BASE_URL / ANALYSIS_SHARED_SECRET,跳过启动",
    );
    return;
  }
  started = true;
  ensureRoot();
  timer = setInterval(() => {
    void pollOnce();
  }, POLL_INTERVAL_MS);
  // Node 里 setInterval 默认会阻止进程退出;开发热重启期间 unref 让它别拖住 exit
  if (typeof timer.unref === "function") timer.unref();
  console.info(
    `[opinion.downloader] started, interval=${POLL_INTERVAL_MS}ms`,
  );
  // 启动就跑一次(不等第一轮 tick)
  void pollOnce();
}

/** 测试用:关闭定时器,清理状态。 */
export function _stopDownloaderForTest(): void {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
  running = false;
}
