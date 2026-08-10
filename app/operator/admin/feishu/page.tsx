/**
 * 管理员 · 飞书集成:
 *  - 单向推送:自定义机器人 webhook(多群)+ 测试 + 手动/定时日报。
 *  - 双向对话:自建应用(事件订阅 → 只读 Agent → 回发)+ 会话白名单。
 */
import { requireRole } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircleMore, Send } from "lucide-react";

import { FeishuPanel } from "./_components/FeishuPanel";
import { FeishuAppPanel } from "./_components/FeishuAppPanel";

export default async function FeishuAdminPage() {
  await requireRole("ADMIN");

  return (
    <div className="p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header>
          <h1 className="text-lg font-semibold">飞书集成</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理对外推送和群聊问答。两种模式独立配置，可按需启用。
          </p>
        </header>

        <Tabs defaultValue="outbound" className="gap-5">
          <TabsList className="grid w-full grid-cols-1 gap-1 group-data-horizontal/tabs:h-auto sm:grid-cols-2">
            <TabsTrigger value="outbound" className="h-auto justify-start py-3 sm:px-4">
              <Send data-icon="inline-start" />
              <span>单向推送</span>
              <Badge variant="outline">Webhook</Badge>
            </TabsTrigger>
            <TabsTrigger value="conversation" className="h-auto justify-start py-3 sm:px-4">
              <MessageCircleMore data-icon="inline-start" />
              <span>双向对话</span>
              <Badge variant="outline">自建应用</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="outbound" className="flex flex-col gap-5">
            <section aria-labelledby="outbound-title">
              <header className="mb-5">
                <h2 id="outbound-title" className="font-semibold">
                  单向推送 · 自定义机器人
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  向多个飞书群测试连通、手动发送或每日 09:00 自动推送运营数据日报。
                </p>
              </header>
              <FeishuPanel />
            </section>
          </TabsContent>

          <TabsContent value="conversation" className="flex flex-col gap-5">
            <section aria-labelledby="conversation-title">
              <header className="mb-5">
                <h2 id="conversation-title" className="font-semibold">
                  双向对话 · 自建应用
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  在飞书群里 @机器人查询项目数据和知识库；机器人仅提供只读能力。
                </p>
              </header>
              <FeishuAppPanel />
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
