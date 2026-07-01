/**
 * 阶段9 · 舆情监控 · 报告存储路径帮手。
 *
 * 布局:
 *   storage/opinion-reports/<taskId>/
 *     ├── index.html   # 从分析服务拉回来的报告 HTML
 *     ├── data.json    # 报告结构化数据(私域/公域为 asdict 产物,combined 可能没有)
 *     └── meta.json    # { taskId, scope, game, downloadedAt } 冗余,便于列表排序
 *
 * 目录本身不入 git(整树在 .gitignore),运营和 ADMIN 通过鉴权路由读取。
 * task_id 只允许字母/数字/下划线,防目录穿越。
 */
import fs from "node:fs";
import path from "node:path";

import { AppError } from "@/lib/errors";

const ROOT = path.resolve(process.cwd(), "storage", "opinion-reports");
const SAFE_ID = /^[A-Za-z0-9_.-]{1,80}$/;

export function assertSafeTaskId(taskId: string): void {
  if (!SAFE_ID.test(taskId)) {
    throw new AppError("BAD_REQUEST", `非法的 taskId 格式: ${taskId}`);
  }
}

/** storage/opinion-reports/<taskId> 的绝对路径。 */
export function taskDir(taskId: string): string {
  assertSafeTaskId(taskId);
  return path.join(ROOT, taskId);
}

/** 三个产物的绝对路径。 */
export function htmlPath(taskId: string): string {
  return path.join(taskDir(taskId), "index.html");
}
export function jsonPath(taskId: string): string {
  return path.join(taskDir(taskId), "data.json");
}
export function metaPath(taskId: string): string {
  return path.join(taskDir(taskId), "meta.json");
}

/** 已下载 = HTML 文件存在(判据单一,避免半成品状态)。 */
export function isDownloaded(taskId: string): boolean {
  try {
    return fs.statSync(htmlPath(taskId)).isFile();
  } catch {
    return false;
  }
}

export function ensureRoot(): void {
  fs.mkdirSync(ROOT, { recursive: true });
}

export function ensureTaskDir(taskId: string): void {
  fs.mkdirSync(taskDir(taskId), { recursive: true });
}

/** 删任务目录(ADMIN delete 时清中台侧留底)。 */
export function removeTaskDir(taskId: string): void {
  try {
    fs.rmSync(taskDir(taskId), { recursive: true, force: true });
  } catch (err) {
    console.warn("[opinion.storage] removeTaskDir 失败", taskId, err);
  }
}
