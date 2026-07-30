const REPRODUCIBLE_AGENT_VERSION = [0, 5, 0] as const;

function parseVersion(version: string | null): [number, number, number] | null {
  if (!version) return null;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function supportsReproducibleExecution(
  version: string | null,
): boolean {
  const parsed = parseVersion(version);
  if (!parsed) return false;
  for (let index = 0; index < REPRODUCIBLE_AGENT_VERSION.length; index += 1) {
    if (parsed[index] > REPRODUCIBLE_AGENT_VERSION[index]) return true;
    if (parsed[index] < REPRODUCIBLE_AGENT_VERSION[index]) return false;
  }
  return true;
}
