/**
 * 管理员 · 飞书集成:
 *  - 单向推送:自定义机器人 webhook(多群)+ 测试 + 手动/定时日报。
 *  - 双向对话:自建应用(事件订阅 → 只读 Agent → 回发)+ 会话白名单。
 */
import { requireRole } from "@/lib/rbac";

import { FeishuPanel } from "./_components/FeishuPanel";
import { FeishuAppPanel } from "./_components/FeishuAppPanel";

export default async function FeishuAdminPage() {
  await requireRole("ADMIN");

  return (
    <div className="space-y-8 p-6">
      <section>
        <header className="mb-4">
          <h1 className="text-lg font-semibold">飞书 · 单向推送(自定义机器人)</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            配置飞书群自定义机器人 webhook(可多群),测试连通、手动或每日定时(09:00)推送运营数据日报。
          </p>
        </header>
        <FeishuPanel />
      </section>

      <section>
        <header className="mb-4">
          <h1 className="text-lg font-semibold">飞书 · 双向对话(自建应用)</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            在飞书群 @机器人 直接问项目数据/知识库(只读)。需自建应用 + 事件订阅;回调地址见下方,配置后勾选允许的会话。
          </p>
        </header>
        <FeishuAppPanel />
      </section>
    </div>
  );
}
