/**
 * Agent 离线判定:lastSeenAt 距今超过 10 分钟视为离线。
 *
 * 只对 status=ACTIVE 的 agent 有意义;DISABLED 的不算"离线"(本来就是被人停用)。
 */
export const OFFLINE_THRESHOLD_MS = 10 * 60 * 1000;

export function isOffline(lastSeenAt: Date | null, status: string): boolean {
  if (status !== "ACTIVE") return false;
  if (!lastSeenAt) return true; // 从未上报过
  return Date.now() - lastSeenAt.getTime() > OFFLINE_THRESHOLD_MS;
}

/** SQL where 片段:筛 ACTIVE + (lastSeenAt is null OR lastSeenAt < cutoff) */
export function offlineWhere() {
  const cutoff = new Date(Date.now() - OFFLINE_THRESHOLD_MS);
  return {
    status: "ACTIVE" as const,
    OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }],
  };
}
