/**
 * 稿件审核相关:
 * - URL → externalId 解析(三大平台)
 * - 三子状态(标题/内容/易闪)→ 最终态派生
 */
import type { ReviewStatus, SubmissionStatus } from "@prisma/client";

/** 已知平台(与创作者投稿表单 PLATFORMS 一致) */
export type KnownPlatform = "抖音" | "哔哩哔哩" | "小红书";

/**
 * 从稿件链接解析平台 externalId(平台稿件 ID)。
 * 易闪导入按 (platform, externalId) 匹配,因此规则尽量稳定。
 * 解析失败返回 null,允许稿件先入库,后续可由运营补录。
 */
export function parseExternalId(
  platform: string,
  rawUrl: string,
): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname;

  // 抖音 https://www.douyin.com/video/<digits>
  if (platform === "抖音" || host.endsWith("douyin.com")) {
    const m = /\/video\/(\d{6,})/.exec(path);
    if (m) return m[1];
    return null;
  }

  // 哔哩哔哩
  //   PC: https://www.bilibili.com/video/BV1xx411c7mD
  //   PC: https://www.bilibili.com/video/av170001
  //   短: https://b23.tv/xxxxxx(短链解析需服务端跟随,这里返回 null)
  if (platform === "哔哩哔哩" || host.endsWith("bilibili.com")) {
    const bv = /\/video\/(BV[0-9A-Za-z]{8,})/.exec(path);
    if (bv) return bv[1];
    const av = /\/video\/av(\d+)/i.exec(path);
    if (av) return av[1];
    return null;
  }

  // 小红书
  //   https://www.xiaohongshu.com/explore/<id>
  //   https://www.xiaohongshu.com/discovery/item/<id>
  if (platform === "小红书" || host.endsWith("xiaohongshu.com")) {
    const m = /\/(?:explore|discovery\/item)\/([0-9a-f]{6,})/i.exec(path);
    if (m) return m[1];
    return null;
  }

  // 兜底:取路径最后一段纯数字
  const tail = /\/(\d{6,})(?:\/|\?|#|$)/.exec(path);
  return tail ? tail[1] : null;
}

/**
 * 抖音短链(v.douyin.com/xxx/、b23.tv/xxx 等)只有跟随 302 后才能拿到含 vid 的真链。
 * 在投稿 POST 里若同步 parseExternalId 失败,再用本函数走一次重定向解析。
 * 失败返回 null(网络/平台异常,允许稿件先入库,运营手动补)。
 */
export async function resolveAndParseExternalId(
  platform: string,
  rawUrl: string,
): Promise<string | null> {
  const direct = parseExternalId(platform, rawUrl);
  if (direct) return direct;

  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();

  // 仅对已知的短链域名做重定向解析,避免任意 url 触发外部请求
  const isDouyinShort =
    host === "v.douyin.com" || host === "iesdouyin.com";
  if (!isDouyinShort) return null;

  try {
    const res = await fetch(rawUrl, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        // 抖音对 UA 较敏感,空 / 默认 UA 可能不跳转
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      // 5 秒超时,避免拖慢投稿
      signal: AbortSignal.timeout(5000),
    });
    return parseExternalId(platform, res.url);
  } catch {
    return null;
  }
}

/**
 * 三子状态 → 最终状态:
 *   任一 REJECTED → REJECTED
 *   全部 APPROVED → APPROVED
 *   其它 → PENDING
 */
export function deriveSubmissionStatus(
  title: ReviewStatus,
  content: ReviewStatus,
  yishan: ReviewStatus,
): SubmissionStatus {
  if (title === "REJECTED" || content === "REJECTED" || yishan === "REJECTED")
    return "REJECTED";
  if (title === "APPROVED" && content === "APPROVED" && yishan === "APPROVED")
    return "APPROVED";
  return "PENDING";
}
