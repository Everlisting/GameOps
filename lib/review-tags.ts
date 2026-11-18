/** 树的展示与校验共用同一套层级语义；停用祖先会停用整条分支。 */
export type ReviewTagNode = {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  sortOrder: number;
  enabled: boolean;
};

export function tagDescendants(tags: ReviewTagNode[], id: string): Set<string> {
  const found = new Set([id]);
  const queue = [id];
  for (let index = 0; index < queue.length; index++) {
    for (const tag of tags) {
      if (tag.parentId === queue[index] && !found.has(tag.id)) {
        found.add(tag.id);
        queue.push(tag.id);
      }
    }
  }
  return found;
}

export function flattenReviewTags(tags: ReviewTagNode[]) {
  const result: (ReviewTagNode & {
    depth: number;
    path: string;
    available: boolean;
  })[] = [];
  const visited = new Set<string>();
  function walk(
    parentId: string | null,
    depth: number,
    path: string,
    available: boolean,
  ) {
    const children = tags
      .filter((tag) => tag.parentId === parentId)
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name, "zh-CN") ||
          a.id.localeCompare(b.id),
      );
    for (const tag of children) {
      if (visited.has(tag.id)) continue;
      visited.add(tag.id);
      const nextPath = path ? `${path} / ${tag.name}` : tag.name;
      const nextAvailable = available && tag.enabled;
      result.push({ ...tag, depth, path: nextPath, available: nextAvailable });
      walk(tag.id, depth + 1, nextPath, nextAvailable);
    }
  }
  walk(null, 0, "", true);
  return result;
}
