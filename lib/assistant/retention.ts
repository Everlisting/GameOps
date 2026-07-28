/**
 * 阶段10.3 · 创作者对话保留策略:只保留近 1 月,超期硬删(级联删消息)。
 * 由 instrumentation 的每日 cron 调用。
 */
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const log = createLogger("retention");

export async function cleanupOldCreatorChats(): Promise<number> {
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const res = await prisma.aiConversation.deleteMany({
    where: { audience: "creator", updatedAt: { lt: monthAgo } },
  });
  if (res.count > 0) log.info("清理过期创作者对话", { event: "retention.creator_chat.cleaned", count: res.count });
  return res.count;
}
