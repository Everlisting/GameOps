/**
 * GET /operator/opinion/reports/[taskId]/data.json
 *
 * 供调试 / 二次加工用的 JSON 下载路径,鉴权与 view 一致(OPERATOR+)。
 * combined 报告可能没有 JSON(analyze_combined 不 dump),此时 404。
 */
import fs from "node:fs/promises";

import { route } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { requireRole } from "@/lib/rbac";
import { assertSafeTaskId, jsonPath } from "@/lib/opinion/storage";

export const GET = route(async (_req, { params }) => {
  await requireRole("OPERATOR");
  const taskId = params?.taskId ?? "";
  assertSafeTaskId(taskId);

  let buf: Buffer;
  try {
    buf = await fs.readFile(jsonPath(taskId));
  } catch {
    throw notFound("该报告尚无 JSON 产物(combined 报告可能不带 JSON)");
  }
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `inline; filename="${taskId}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
