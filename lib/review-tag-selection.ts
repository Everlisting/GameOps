import type { ReviewTagNode } from "./review-tags";

export type ReviewTagSelection = [string | null, string | null, string | null];

/** 回显一条完整路径；旧的多路径/更深层引用由表单在未修改时原样保留。 */
export function initialReviewTagSelection(
  ids: string[],
  tags: ReviewTagNode[],
): ReviewTagSelection {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  let longest: string[] = [];
  for (const id of ids) {
    const path: string[] = [];
    const visited = new Set<string>();
    let tag = byId.get(id);
    while (tag && !visited.has(tag.id)) {
      visited.add(tag.id);
      path.unshift(tag.id);
      tag = tag.parentId ? byId.get(tag.parentId) : undefined;
    }
    if (path.length > longest.length) longest = path;
  }
  return [longest[0] ?? null, longest[1] ?? null, longest[2] ?? null];
}

export function changeReviewTagSelection(
  selection: ReviewTagSelection,
  level: number,
  id: string | null,
): ReviewTagSelection {
  return selection.map((old, index) =>
    index < level ? old : index === level ? id : null,
  ) as ReviewTagSelection;
}

/** 只保存末级，展示时由 videoTagLevels 展开祖先，避免重复关联。 */
export function selectedReviewTagIds(selection: ReviewTagSelection): string[] {
  const id = [...selection].reverse().find(Boolean);
  return id ? [id] : [];
}
