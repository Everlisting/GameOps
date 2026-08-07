import { createHash } from "node:crypto";

/** 正文摘要用于并发提示、审计和排查；不把整篇正文写入 AuditLog。 */
export function knowledgeContentChecksum(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export const EDITABLE_KNOWLEDGE_STATUSES = ["draft", "failed"] as const;
