/**
 * 管理员 · 飞书外发配置(webhook 多群 + 测试 + 手动/定时推送运营数据日报)。
 */
import { requireRole } from "@/lib/rbac";

import { FeishuPanel } from "./_components/FeishuPanel";

export default async function FeishuAdminPage() {
  await requireRole("ADMIN");

  return (
    <div className="p-6">
      <header className="mb-4">
        <h1 className="text-lg font-semibold">飞书外发</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          配置飞书群自定义机器人 webhook(可多群),测试连通、手动或每日定时(09:00)推送运营数据日报。
        </p>
      </header>
      <FeishuPanel />
    </div>
  );
}
