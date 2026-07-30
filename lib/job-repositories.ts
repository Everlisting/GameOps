export type RepositoryConfigSource = {
  id: string;
  name: string;
  agentId: string;
  repoType: "GIT" | "SVN";
  repoUrl: string;
  repoBranch: string | null;
};

export type RepositoryPreset = {
  id: string;
  agentId: string;
  repoType: "GIT" | "SVN";
  repoUrl: string;
  repoBranch: string;
  jobCount: number;
  sourceJobNames: string[];
};

export function buildRepositoryPresets(
  sources: RepositoryConfigSource[],
): RepositoryPreset[] {
  const grouped = new Map<string, RepositoryPreset>();

  for (const source of sources) {
    const repoUrl = source.repoUrl.trim();
    if (!repoUrl) continue;

    const repoBranch = source.repoBranch?.trim() ?? "";
    const key = JSON.stringify([
      source.agentId,
      source.repoType,
      repoUrl,
      repoBranch,
    ]);
    const existing = grouped.get(key);

    if (existing) {
      existing.jobCount += 1;
      existing.sourceJobNames.push(source.name);
      continue;
    }

    grouped.set(key, {
      id: source.id,
      agentId: source.agentId,
      repoType: source.repoType,
      repoUrl,
      repoBranch,
      jobCount: 1,
      sourceJobNames: [source.name],
    });
  }

  return Array.from(grouped.values()).sort((left, right) => {
    const agentOrder = left.agentId.localeCompare(right.agentId);
    if (agentOrder !== 0) return agentOrder;

    const urlOrder = left.repoUrl.localeCompare(right.repoUrl);
    if (urlOrder !== 0) return urlOrder;

    return left.repoBranch.localeCompare(right.repoBranch);
  });
}
