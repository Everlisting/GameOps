/**
 * 抖音 Open Platform 嵌入式播放器接口。
 *
 * 文档:GET https://open.douyin.com/api/douyin/v1/video/get_iframe_by_video?video_id=<vid>
 * 返回里通常包含 iframe 的可嵌入 src(可能在 data.iframe_url / data.data.iframe_url,
 * 或被包在 iframe_html 字符串里)。不同接入态(普通 / 服务端 / 跨端)返回结构略有差异,
 * 这里尽量兼容,拿不到就返回 null,由上层回退到 open.douyin.com/player/video 拼装。
 *
 * 大多数应用类型调用此接口需带 access-token(header)。把 token 通过环境变量
 * DOUYIN_ACCESS_TOKEN 注入;不设也会尝试调一次,失败就回退。
 */
const API_BASE =
  "https://open.douyin.com/api/douyin/v1/video/get_iframe_by_video";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function extractSrcFromHtml(html: unknown): string | null {
  if (typeof html !== "string" || !html) return null;
  const m = /src=["']([^"']+)["']/.exec(html);
  return m?.[1] ?? null;
}

/**
 * 拿到 vid 对应的官方 iframe src。
 * - 命中:返回字符串 URL
 * - 接口不通 / 不返回有效字段:返回 null
 */
export async function fetchDouyinEmbedUrl(vid: string): Promise<string | null> {
  if (!/^\d{6,}$/.test(vid)) return null;
  const url = `${API_BASE}?video_id=${encodeURIComponent(vid)}`;
  const token = process.env.DOUYIN_ACCESS_TOKEN;
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": UA,
        ...(token ? { "access-token": token } : {}),
      },
      signal: AbortSignal.timeout(5000),
      // 同 vid 的结果稳定,允许 Next 服务端 1 小时缓存
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const root = (json as Record<string, unknown> | null) ?? {};
    const data = (root.data as Record<string, unknown> | undefined) ?? {};
    const nested =
      (data.data as Record<string, unknown> | undefined) ?? undefined;
    const candidates: unknown[] = [
      data.iframe_url,
      data.url,
      nested?.iframe_url,
      nested?.url,
      extractSrcFromHtml(data.iframe_html),
      extractSrcFromHtml(nested?.iframe_html),
    ];
    for (const c of candidates) {
      if (typeof c === "string" && /^https?:\/\//i.test(c)) return c;
    }
    return null;
  } catch {
    return null;
  }
}

/** 兜底:接口拿不到时用 open.douyin.com/player/video 直接拼一个 */
export function fallbackDouyinPlayerUrl(vid: string): string {
  return `https://open.douyin.com/player/video?vid=${encodeURIComponent(vid)}&autoplay=1`;
}
