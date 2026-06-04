/**
 * GET /api/operator/submissions/embed?vid=<vid>
 *   返回:{ url: string | null, fallback: string }
 * 用途:运营端审核弹窗打开时调一次,拿抖音官方 iframe src。
 * 拿不到(接口不通 / 字段缺失)返回 url=null,客户端用 fallback 兜底。
 * 设较长的 Cache-Control 让浏览器 / 中间层复用;Next 服务端层也有 revalidate=3600。
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { badRequest } from "@/lib/errors";
import { fetchDouyinEmbedUrl, fallbackDouyinPlayerUrl } from "@/lib/douyin";

export const GET = route(async (req) => {
  await requireRole("OPERATOR");
  const url = new URL(req.url);
  const vid = url.searchParams.get("vid")?.trim() ?? "";
  if (!/^\d{6,}$/.test(vid)) throw badRequest("vid 缺失或非法");

  const embed = await fetchDouyinEmbedUrl(vid);
  return Response.json(
    { url: embed, fallback: fallbackDouyinPlayerUrl(vid) },
    {
      // 浏览器缓存 1 小时;同 vid 反复打开弹窗不重打接口
      headers: { "Cache-Control": "private, max-age=3600" },
    },
  );
});
