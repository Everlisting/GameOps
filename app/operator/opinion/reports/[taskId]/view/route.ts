/**
 * GET /operator/opinion/reports/[taskId]/view
 *
 * 鉴权:middleware 已把未登录 / CREATOR 挡在外面;这里再做 requireRole("OPERATOR")
 * 兜底。ADMIN 因为 role 层级也自然放行。
 *
 * 数据源:storage/opinion-reports/<taskId>/index.html
 *   - 未下载(downloader 还没跑到 / 分析未 DONE)返回 404 带提示
 *   - 存在则以 text/html + inline 返回;浏览器新 tab 直接打开
 *
 * 安全:
 *   - assertSafeTaskId 拒绝路径穿越
 *   - Cache-Control: private, no-store —— 报告不进公共缓存,登出后不残留
 */
import fs from "node:fs/promises";

import { route } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { requireRole } from "@/lib/rbac";
import { assertSafeTaskId, htmlPath, isDownloaded } from "@/lib/opinion/storage";

export const GET = route(async (_req, { params }) => {
  await requireRole("OPERATOR");
  const taskId = params?.taskId ?? "";
  assertSafeTaskId(taskId);

  if (!isDownloaded(taskId)) {
    throw notFound(
      "报告尚未就绪:分析可能还在跑,或后台 downloader 还没把产物拉回中台。请稍后刷新。",
    );
  }

  const buf = await fs.readFile(htmlPath(taskId));
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
