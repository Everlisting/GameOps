import { describe, expect, it } from "vitest";
import type { ReviewTagNode } from "./review-tags";
import {
  changeReviewTagSelection,
  initialReviewTagSelection,
  selectedReviewTagIds,
} from "./review-tag-selection";

const tag = (id: string, parentId: string | null): ReviewTagNode => ({
  id, parentId, name: id, description: "", enabled: true, sortOrder: 0,
});
const tags = [tag("a", null), tag("b", "a"), tag("c", "b"), tag("d", "c")];

describe("审核标签三级联动", () => {
  it("仅保存末级的历史记录也能回显完整路径，四级历史回显前三层", () => {
    expect(initialReviewTagSelection(["c"], tags)).toEqual(["a", "b", "c"]);
    expect(initialReviewTagSelection(["a", "b", "c"], tags)).toEqual(["a", "b", "c"]);
    expect(initialReviewTagSelection(["d"], tags)).toEqual(["a", "b", "c"]);
    expect(initialReviewTagSelection([], tags)).toEqual([null, null, null]);
  });
  it("修改或清空上级时清除下级，修改下级保留祖先", () => {
    expect(changeReviewTagSelection(["a", "b", "c"], 0, "other")).toEqual(["other", null, null]);
    expect(changeReviewTagSelection(["a", "b", "c"], 1, null)).toEqual(["a", null, null]);
    expect(changeReviewTagSelection(["a", "b", "c"], 2, "other")).toEqual(["a", "b", "other"]);
  });
  it("将选择映射为末级ID，清空时返回空数组供必填校验", () => {
    expect(selectedReviewTagIds(["a", "b", "c"])).toEqual(["c"]);
    expect(selectedReviewTagIds(["a", "b", null])).toEqual(["b"]);
    expect(selectedReviewTagIds(["a", null, null])).toEqual(["a"]);
    expect(selectedReviewTagIds([null, null, null])).toEqual([]);
  });
  it("历史停用标签仍可回显，异常循环不会挂起", () => {
    expect(initialReviewTagSelection(["c"], tags.map((tag) => ({ ...tag, enabled: false })))).toEqual(["a", "b", "c"]);
    expect(initialReviewTagSelection(["x"], [tag("x", "y"), tag("y", "x")])).toEqual(["y", "x", null]);
  });
});
