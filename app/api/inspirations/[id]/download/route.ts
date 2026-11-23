import { z } from "zod";
import { route } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { downloadPublishedInspiration } from "@/lib/inspiration-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 公开只读下载：每次请求独立核对发布状态。 */
export const GET = route(async (request, { params }) => {
  const id = z.string().min(1).max(128).parse(params?.id);
  const query = new URL(request.url).searchParams;
  const fileId = z.string().min(1).max(64).optional().parse(query.get("file") ?? undefined);
  const all = z.literal("1").optional().parse(query.get("all") ?? undefined) === "1";
  if (all && fileId) throw badRequest("请选择全部或单个文件下载");
  return downloadPublishedInspiration(id, fileId, all);
});
