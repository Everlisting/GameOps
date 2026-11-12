export type VideoPoolResult = {
  name: string;
  status: "awarded" | "suppressed" | "unmatched";
  reason: string;
};

export function videoPoolResult(name: string, excluded: string | undefined, recipient?: { suppressed: boolean; paidCents: number }): VideoPoolResult {
  if (excluded) return { name, status: "unmatched", reason: excluded };
  if (recipient?.suppressed) return { name, status: "suppressed", reason: "互斥未计奖" };
  if (recipient && recipient.paidCents > 0) return { name, status: "awarded", reason: "参与计奖" };
  return { name, status: "unmatched", reason: "未命中奖励" };
}
