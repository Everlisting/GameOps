/**
 * 阶段9 · 舆情监控 · 分析服务 HTTP 客户端。
 *
 * 所有请求带 Authorization: Bearer <ANALYSIS_SHARED_SECRET>。
 * 触发类接口还要加 X-LLM-* 头(明文 apiKey 只在这一环节传,不入 DB / 不入日志)。
 *
 * 失败策略:
 *   - 分析服务 4xx → 原封不动往上抛,由 handleApiError 转成中台响应
 *   - 分析服务 5xx / 网络错 → 抛 AppError("INTERNAL"),运营看到 500
 */
import { env } from "@/lib/validation/env";
import { AppError } from "@/lib/errors";
import type { OpinionSettingsInternal } from "@/lib/opinion/settings";

const BASE = env.ANALYSIS_BASE_URL;

function bearer(): string {
  if (!env.ANALYSIS_SHARED_SECRET) {
    throw new AppError("INTERNAL", "缺少环境变量 ANALYSIS_SHARED_SECRET");
  }
  return `Bearer ${env.ANALYSIS_SHARED_SECRET}`;
}

function llmHeaders(s: OpinionSettingsInternal): Record<string, string> {
  return {
    "X-LLM-Provider": s.provider,
    "X-LLM-Model": s.model,
    "X-LLM-ApiKey": s.apiKey,
    ...(s.baseUrl ? { "X-LLM-BaseUrl": s.baseUrl } : {}),
  };
}

async function unpackError(res: Response): Promise<never> {
  let payload: unknown = null;
  try { payload = await res.json(); } catch { /* body 非 JSON */ }
  const detail =
    (payload && typeof payload === "object" && "detail" in payload
      ? (payload as { detail: unknown }).detail
      : payload) ?? {};
  const message =
    (typeof detail === "object" && detail && "message" in detail
      ? String((detail as { message: unknown }).message)
      : `分析服务返回 ${res.status}`);
  // 4xx 透传;5xx 一律标 INTERNAL
  if (res.status >= 500) {
    throw new AppError("INTERNAL", `分析服务错误(${res.status}): ${message}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new AppError("INTERNAL", `分析服务鉴权失败:${message}`);
  }
  if (res.status === 404) {
    throw new AppError("NOT_FOUND", message);
  }
  if (res.status === 409) {
    throw new AppError("CONFLICT", message);
  }
  throw new AppError("BAD_REQUEST", message);
}

export interface AnalysisTaskInfo {
  task_id: string;
  scope: "private" | "public" | "combined";
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  game: string;
  coverage_span: string | null;
  created_by: string;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  duration_ms: number | null;
  error_message: string | null;
  parent_private?: string | null;
  parent_public?: string | null;
  llm_provider?: string | null;
  llm_model?: string | null;
  has_html: boolean;
  has_json: boolean;
}

export interface TaskCreated {
  task_id: string;
  status: "PENDING";
}

/** 触发私域/公域(附文件上传)。 */
export async function triggerFileTask(
  scope: "private" | "public",
  args: { file: Blob; fileName: string; game: string; coverageSpan?: string; createdBy: string; settings: OpinionSettingsInternal },
): Promise<TaskCreated> {
  const form = new FormData();
  form.append("file", args.file, args.fileName);
  form.append("game", args.game);
  if (args.coverageSpan) form.append("coverage_span", args.coverageSpan);
  form.append("created_by", args.createdBy);

  const res = await fetch(`${BASE}/tasks/${scope}`, {
    method: "POST",
    headers: { Authorization: bearer(), ...llmHeaders(args.settings) },
    body: form,
  }).catch((err) => {
    throw new AppError("INTERNAL", `分析服务不可达:${err instanceof Error ? err.message : String(err)}`);
  });
  if (!res.ok) return unpackError(res);
  return (await res.json()) as TaskCreated;
}

/** 触发对比。 */
export async function triggerCombined(args: {
  privateTaskId: string;
  publicTaskId: string;
  game?: string;
  createdBy: string;
  settings: OpinionSettingsInternal;
}): Promise<TaskCreated> {
  const body = {
    private_task_id: args.privateTaskId,
    public_task_id: args.publicTaskId,
    game: args.game,
    created_by: args.createdBy,
  };
  const res = await fetch(`${BASE}/tasks/combined`, {
    method: "POST",
    headers: {
      Authorization: bearer(),
      "Content-Type": "application/json",
      ...llmHeaders(args.settings),
    },
    body: JSON.stringify(body),
  }).catch((err) => {
    throw new AppError("INTERNAL", `分析服务不可达:${err instanceof Error ? err.message : String(err)}`);
  });
  if (!res.ok) return unpackError(res);
  return (await res.json()) as TaskCreated;
}

/** 列表。 */
export async function listTasks(params: {
  scope?: string; status?: string; limit?: number; offset?: number;
}): Promise<{ items: AnalysisTaskInfo[]; total: number }> {
  const q = new URLSearchParams();
  if (params.scope) q.set("scope", params.scope);
  if (params.status) q.set("status", params.status);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));
  const res = await fetch(`${BASE}/tasks?${q.toString()}`, {
    headers: { Authorization: bearer() },
    cache: "no-store",
  }).catch((err) => {
    throw new AppError("INTERNAL", `分析服务不可达:${err instanceof Error ? err.message : String(err)}`);
  });
  if (!res.ok) return unpackError(res);
  return (await res.json()) as { items: AnalysisTaskInfo[]; total: number };
}

/** 详情。 */
export async function getTask(taskId: string): Promise<AnalysisTaskInfo> {
  const res = await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: bearer() },
    cache: "no-store",
  }).catch((err) => {
    throw new AppError("INTERNAL", `分析服务不可达:${err instanceof Error ? err.message : String(err)}`);
  });
  if (!res.ok) return unpackError(res);
  return (await res.json()) as AnalysisTaskInfo;
}

/** 下载 HTML / JSON:返回 Response 供中台再 stream 给浏览器。 */
export async function fetchTaskArtifact(taskId: string, kind: "html" | "json"): Promise<Response> {
  const res = await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}/${kind}`, {
    headers: { Authorization: bearer() },
  }).catch((err) => {
    throw new AppError("INTERNAL", `分析服务不可达:${err instanceof Error ? err.message : String(err)}`);
  });
  if (!res.ok) return unpackError(res);
  return res;
}

/** 重跑。 */
export async function rerunTask(args: {
  taskId: string; createdBy: string; settings: OpinionSettingsInternal;
}): Promise<TaskCreated> {
  const form = new FormData();
  form.append("created_by", args.createdBy);
  const res = await fetch(`${BASE}/tasks/${encodeURIComponent(args.taskId)}/rerun`, {
    method: "POST",
    headers: { Authorization: bearer(), ...llmHeaders(args.settings) },
    body: form,
  }).catch((err) => {
    throw new AppError("INTERNAL", `分析服务不可达:${err instanceof Error ? err.message : String(err)}`);
  });
  if (!res.ok) return unpackError(res);
  return (await res.json()) as TaskCreated;
}

/** 删除。 */
export async function deleteTask(taskId: string): Promise<void> {
  const res = await fetch(`${BASE}/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
    headers: { Authorization: bearer() },
  }).catch((err) => {
    throw new AppError("INTERNAL", `分析服务不可达:${err instanceof Error ? err.message : String(err)}`);
  });
  if (!res.ok) return unpackError(res);
}
