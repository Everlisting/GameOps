import { flattenReviewTags, type ReviewTagNode } from "@/lib/review-tags";

/** 官方播放器默认固定尺寸；显式按 iframe 视口布局，保留播放器与底部控制区。 */
export function responsiveVideoEmbedUrl(src: string): string {
  try {
    const url = new URL(src);
    if (url.hostname === "open.douyin.com" && url.pathname === "/player/video") {
      url.searchParams.set("width", "100%");
      // 百分比高度依赖平台文档的父元素高度，vh 直接使用 iframe 的视口。
      url.searchParams.set("height", "100vh");
      url.searchParams.set("autoplay", "0");
      return url.toString();
    }
  } catch {
    // 其他平台地址保持原样。
  }
  return src;
}

/** 展示含省略号共不超过 15 个 Unicode 字符，原始标题保留在详情与提示中。 */
export function shortVideoTitle(title: string): string {
  const chars = Array.from(title.replace(/\s+/gu, " ").trim());
  return chars.length > 15 ? `${chars.slice(0, 14).join("")}…` : chars.join("");
}

export function videoTagLevels(ids: string[], tags: ReviewTagNode[]) {
  const byId = new Map(flattenReviewTags(tags).map((tag) => [tag.id, tag]));
  const levels: { id: string; name: string; path: string }[][] = [[], [], []];
  for (const id of ids) {
    let tag = byId.get(id);
    const visited = new Set<string>();
    while (tag && !visited.has(tag.id)) {
      visited.add(tag.id);
      if (
        tag.depth < 3 &&
        !levels[tag.depth].some((item) => item.id === tag!.id)
      ) {
        levels[tag.depth].push({ id: tag.id, name: tag.name, path: tag.path });
      }
      tag = tag.parentId ? byId.get(tag.parentId) : undefined;
    }
  }
  return levels;
}
