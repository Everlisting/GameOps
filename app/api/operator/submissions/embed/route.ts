/**
 * GET /api/operator/submissions/embed?vid=<vid>
 *   返回:{ url: string | null, fallback: string }
 * 用途:运营端审核弹窗打开时调一次,拿抖音官方 iframe src。
 * 拿不到(接口不通 / 字段缺失)返回 url=null,客户端用 fallback 兜底。
 * 每次请求校验分配权限，不缓存带身份的接口响应；上游播放器地址仍可短时复用。
 */
import { route } from "@/lib/api";
import { requireRole } from "@/lib/rbac";
import { badRequest } from "@/lib/errors";
import { fetchDouyinEmbedUrl, fallbackDouyinPlayerUrl } from "@/lib/douyin";
import { assertAssignedExternalVideo } from "@/lib/video-review-access";

export const GET = route(async (req) => {
  const actor = await requireRole("REVIEWER");
  const url = new URL(req.url);
  const vid = url.searchParams.get("vid")?.trim() ?? "";
  if (!/^\d{6,}$/.test(vid)) throw badRequest("vid 缺失或非法");
  await assertAssignedExternalVideo(vid, actor);

  const embed = await fetchDouyinEmbedUrl(vid);
  return Response.json(
    { url: embed, fallback: fallbackDouyinPlayerUrl(vid) },
    {
      // 防止同一浏览器切换账号或分配关系变化后复用旧的授权响应。
      headers: { "Cache-Control": "private, no-store" },
    },
  );
});
