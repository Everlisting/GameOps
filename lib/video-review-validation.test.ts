import { describe, expect, it } from "vitest";
import type { ReviewTagNode } from "./review-tags";
import { validateVideoReview } from "./video-review-validation";

const tag = (id: string, parentId: string | null, enabled = true): ReviewTagNode => ({
  id, parentId, enabled, name: id, description: "", sortOrder: 0,
});
const tags = [
  tag("one", null),
  tag("two", null), tag("two-leaf", "two"),
  tag("three", null), tag("three-child", "three"), tag("three-leaf", "three-child"),
];

describe("视频审核保存必填校验", () => {
  it("待审核和空标签同时提示；必须给出通过或未通过结果", () => {
    expect(validateVideoReview("PENDING", [], tags)).toMatchObject({
      status: expect.any(String), tag: { level: 0 },
    });
    expect(validateVideoReview("", ["one"], tags).status).toBeTruthy();
    expect(validateVideoReview("APPROVED", ["one"], tags)).toEqual({});
    expect(validateVideoReview("REJECTED", ["one"], tags)).toEqual({});
  });
  it("只有一级的分支选一级即可，两级分支不要求第三级", () => {
    expect(validateVideoReview("APPROVED", ["one"], tags)).toEqual({});
    expect(validateVideoReview("APPROVED", ["two"], tags).tag?.level).toBe(1);
    expect(validateVideoReview("APPROVED", ["two-leaf"], tags)).toEqual({});
  });
  it("三级分支必须依次选满，但不要求选择第四级", () => {
    expect(validateVideoReview("APPROVED", ["three"], tags).tag?.level).toBe(1);
    expect(validateVideoReview("APPROVED", ["three-child"], tags).tag?.level).toBe(2);
    expect(validateVideoReview("APPROVED", ["three-leaf"], tags)).toEqual({});
    expect(validateVideoReview("APPROVED", ["three-leaf"], [...tags, tag("four", "three-leaf")])).toEqual({});
  });
  it("停用的下级不强制选择；已有停用末级可保留，变更丢失的标签需重选", () => {
    const disabled = [tag("root", null), tag("disabled", "root", false), tag("deep", "disabled")];
    expect(validateVideoReview("APPROVED", ["root"], disabled)).toEqual({});
    expect(validateVideoReview("APPROVED", ["disabled"], disabled)).toEqual({});
    expect(validateVideoReview("APPROVED", ["missing"], tags).tag?.level).toBe(0);
    expect(validateVideoReview("APPROVED", [], []).tag?.level).toBe(0);
  });
  it("兼容历史祖先与末级重复关联，多路径各自都必须选到末级", () => {
    expect(validateVideoReview("APPROVED", ["three", "three-child", "three-leaf"], tags)).toEqual({});
    expect(validateVideoReview("APPROVED", ["one", "three-leaf"], tags)).toEqual({});
    expect(validateVideoReview("APPROVED", ["two", "three-leaf"], tags).tag?.level).toBe(1);
  });
});
