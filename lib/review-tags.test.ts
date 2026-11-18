import { describe, expect, it } from "vitest";
import {
  flattenReviewTags,
  tagDescendants,
  type ReviewTagNode,
} from "./review-tags";

const tag = (
  id: string,
  parentId: string | null = null,
  enabled = true,
  sortOrder = 0,
): ReviewTagNode => ({
  id,
  name: id,
  parentId,
  enabled,
  sortOrder,
  description: "",
});
describe("多级审核标签", () => {
  it("按同级顺序遍历，保留完整路径，祖先停用会向下传递", () => {
    const flat = flattenReviewTags([
      tag("b", null, true, 2),
      tag("child", "a"),
      tag("a", null, false, 1),
      tag("leaf", "child"),
    ]);
    expect(flat.map((item) => item.id)).toEqual(["a", "child", "leaf", "b"]);
    expect(flat[2]).toMatchObject({
      path: "a / child / leaf",
      depth: 2,
      available: false,
    });
    expect(flat[3].available).toBe(true);
  });
  it("后代包含自身，忽略其他分支，用于阻止循环移动", () => {
    const tags = [
      tag("root"),
      tag("child", "root"),
      tag("leaf", "child"),
      tag("other"),
    ];
    expect([...tagDescendants(tags, "root")]).toEqual([
      "root",
      "child",
      "leaf",
    ]);
  });
  it("异常循环数据不会导致遍历无限循环", () => {
    const tags = [tag("a", "b"), tag("b", "a")];
    expect([...tagDescendants(tags, "a")]).toEqual(["a", "b"]);
    expect(flattenReviewTags(tags)).toEqual([]);
  });
});
