import { flattenReviewTags, tagDescendants, type ReviewTagNode } from "./review-tags";

export type VideoReviewValidation = {
  status?: string;
  tag?: { level: 0 | 1 | 2; message: string };
};

/** 只要求选满当前分支的可用层级，最多三级；历史祖先与末级重复关联不误报。 */
export function validateVideoReview(
  status: string,
  tagIds: string[],
  tags: ReviewTagNode[],
): VideoReviewValidation {
  const result: VideoReviewValidation = {};
  if (status !== "APPROVED" && status !== "REJECTED") {
    result.status = "请选择「已通过」或「未通过」后再保存。";
  }
  const flat = flattenReviewTags(tags);
  const byId = new Map(flat.map((tag) => [tag.id, tag]));
  if (!tagIds.length) {
    result.tag = { level: 0, message: "请选择一级审核标签。" };
    return result;
  }
  for (const id of tagIds) {
    const tag = byId.get(id);
    if (!tag) {
      result.tag = { level: 0, message: "审核标签已变更，请重新选择。" };
      break;
    }
    if (tag.depth >= 2) continue;
    const descendants = tagDescendants(flat, id);
    if (tagIds.some((other) => other !== id && descendants.has(other))) continue;
    if (flat.some((child) => child.parentId === id && child.available)) {
      const level = tag.depth === 0 ? 1 : 2;
      result.tag = {
        level,
        message: `当前分支还有${level === 1 ? "二级" : "三级"}标签，请继续选择。`,
      };
      break;
    }
  }
  return result;
}
