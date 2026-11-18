import { describe, expect, it } from "vitest";
import { responsiveVideoEmbedUrl, shortVideoTitle, videoTagLevels } from "./video-review-display";
import type { ReviewTagNode } from "./review-tags";
const tag = (id: string, parentId: string | null): ReviewTagNode => ({
  id,
  name: id,
  parentId,
  description: "",
  enabled: true,
  sortOrder: 0,
});

describe("视频审核列表展示", () => {
  it("抖音预览按 iframe 视口适配，不改作品ID及其他平台地址", () => {
    const url = new URL(responsiveVideoEmbedUrl("https://open.douyin.com/player/video?vid=123456&autoplay=1"));
    expect(url.searchParams.get("vid")).toBe("123456");
    expect(url.searchParams.get("width")).toBe("100%");
    expect(url.searchParams.get("height")).toBe("100vh");
    expect(url.searchParams.get("autoplay")).toBe("0");
    expect(responsiveVideoEmbedUrl("https://example.com/video/123456")).toBe("https://example.com/video/123456");
    expect(responsiveVideoEmbedUrl("invalid")).toBe("invalid");
  });
  it("标题单行且含省略号最多15字，不拆开Unicode字符", () => {
    expect(shortVideoTitle("一二三四五六七八九十一二三四五")).toBe(
      "一二三四五六七八九十一二三四五",
    );
    const title = shortVideoTitle("😀一二三四五六七八九十一二三四五六");
    expect(Array.from(title)).toHaveLength(15);
    expect(title.startsWith("😀")).toBe(true);
    expect(title.endsWith("…")).toBe(true);
    expect(shortVideoTitle("第一行\n第二行")).toBe("第一行 第二行");
  });
  it("选中三级标签时展开全部祖先，不将所有标签误当成一级", () => {
    const tags = [tag("一级", null), tag("二级", "一级"), tag("三级", "二级")];
    expect(
      videoTagLevels(["三级"], tags).map((level) =>
        level.map((item) => item.name),
      ),
    ).toEqual([["一级"], ["二级"], ["三级"]]);
  });
  it("多选共享祖先去重，四级选择保留前三层路径", () => {
    const tags = [
      tag("a", null),
      tag("b", "a"),
      tag("c", "b"),
      tag("d", "c"),
      tag("e", "b"),
    ];
    expect(
      videoTagLevels(["d", "e", "a"], tags).map((level) =>
        level.map((item) => item.name),
      ),
    ).toEqual([["a"], ["b"], ["c", "e"]]);
    expect(videoTagLevels([], tags)).toEqual([[], [], []]);
  });
});
