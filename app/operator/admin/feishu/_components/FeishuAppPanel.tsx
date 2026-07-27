"use client";

/**
 * 飞书双向对话配置:自建应用凭证 + 事件回调地址 + 会话白名单。
 * 密钥仅提交不回显(只回打码/是否已配);会话由入站消息自动登记,勾选 allowed 才应答。
 */
import * as React from "react";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

interface AppView {
  appId: string;
  appSecretMask: string;
  hasVerificationToken: boolean;
  hasEncryptKey: boolean;
  enabled: boolean;
  configured: boolean;
}
interface ConnectionView {
  state:
    | "idle"
    | "disabled"
    | "unconfigured"
    | "switching"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "failed";
  lastError: string;
  changedAt: string;
  reconnectAttempts: number;
}
interface ChatView {
  id: string;
  chatId: string;
  name: string;
  chatType: string;
  allowed: boolean;
  lastSeenAt: string;
}

export function FeishuAppPanel() {
  const [app, setApp] = React.useState<AppView | null>(null);
  const [connection, setConnection] = React.useState<ConnectionView | null>(null);
  const [chats, setChats] = React.useState<ChatView[]>([]);
  const [flash, setFlash] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = React.useState(false);

  // 表单(密钥留空=不改)
  const [appId, setAppId] = React.useState("");
  const [appSecret, setAppSecret] = React.useState("");
  const [enabled, setEnabled] = React.useState(false);

  const load = React.useCallback(async () => {
    const [a, c] = await Promise.all([
      fetch("/api/operator/admin/feishu/app", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/operator/admin/feishu/chats", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ]);
    if (a?.app) {
      setApp(a.app);
      setConnection(a.connection ?? null);
      setAppId(a.app.appId ?? "");
      setEnabled(a.app.enabled ?? false);
    }
    if (c?.chats) setChats(c.chats);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setFlash(null);
    const body: Record<string, unknown> = { appId, enabled };
    if (appSecret.trim()) body.appSecret = appSecret.trim();
    try {
      const res = await fetch("/api/operator/admin/feishu/app", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const d = (await res.json()) as {
          app: AppView;
          connection: ConnectionView;
        };
        setApp(d.app);
        setConnection(d.connection);
        setAppSecret("");
        setFlash({ kind: "ok", text: "已保存,长连接已热更新" });
      } else {
        const e = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setFlash({ kind: "err", text: e?.error?.message ?? "保存失败" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleChat(id: string, allowed: boolean) {
    await fetch(`/api/operator/admin/feishu/chats/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowed }),
    });
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, allowed } : c)));
  }

  async function deleteChat(id: string, name: string) {
    if (!confirm(`确认移除会话「${name || "未命名会话"}」?将删除其白名单记录与历史对话。`)) return;
    const res = await fetch(`/api/operator/admin/feishu/chats/${id}`, { method: "DELETE" });
    if (res.ok) setChats((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-4">
      {/* 长连接说明 */}
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 text-sm">
        <div className="mb-1 font-medium">长连接模式(WebSocket)</div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          本中台用飞书 SDK 长连接接收消息,<b>无需公网回调地址 / 内网穿透</b>,只要中台能出站访问公网即可(本地开发也能收)。
          步骤:①填下方 App ID / App Secret、勾选启用、保存,中台会先验证并热切换连接;
          ②在飞书开放平台「事件与回调 → 事件配置」把订阅方式改为「使用长连接接收事件」并保存
          (需长连接在线才能保存成功),订阅 <code>im.message.receive_v1</code>。
        </p>
      </div>

      {/* 应用凭证 */}
      <div className="rounded-lg border p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          自建应用凭证
          {app?.configured && <Badge variant={app.enabled ? "success" : "muted"}>{app.enabled ? "已启用" : "未启用"}</Badge>}
          {connection && (
            <Badge
              variant={
                connection.state === "connected"
                  ? "success"
                  : connection.state === "failed"
                    ? "destructive"
                    : connection.state === "switching" ||
                        connection.state === "connecting" ||
                        connection.state === "reconnecting"
                      ? "warning"
                      : "muted"
              }
            >
              {connection.state === "connected"
                ? "长连接在线"
                : connection.state === "switching"
                  ? "正在热切换"
                  : connection.state === "connecting"
                    ? "正在连接"
                    : connection.state === "reconnecting"
                      ? "正在重连"
                      : connection.state === "failed"
                        ? "连接失败"
                        : "长连接未运行"}
            </Badge>
          )}
        </div>
        {connection?.lastError && (
          <p className="mb-2 text-xs text-destructive">{connection.lastError}</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="App ID" value={appId} onChange={(e) => setAppId(e.target.value)} />
          <Input
            placeholder={app?.appSecretMask ? `App Secret(留空不改,当前 ${app.appSecretMask})` : "App Secret"}
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
          />
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
          启用双向对话(关闭后不处理入站消息)
        </label>
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            保存
          </Button>
          {flash && (
            <span className={flash.kind === "ok" ? "text-xs text-emerald-600" : "text-xs text-red-600"}>
              {flash.text}
            </span>
          )}
        </div>
      </div>

      {/* 会话白名单 */}
      <div className="rounded-lg border p-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-medium">会话白名单</div>
          <Button size="xs" variant="ghost" onClick={() => void load()}>
            <RefreshCw className="size-3" />
            刷新
          </Button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          把机器人加进群、在群里 @ 它发一条消息,该群会出现在下面;勾选「允许」后才会应答(群里需 @机器人)。
        </p>
        {chats.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            还没有会话。把机器人加入群并 @ 它发一条消息,再点「刷新」。
          </p>
        ) : (
          <div className="space-y-1.5">
            {chats.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="truncate font-medium">{c.name || "(未命名会话)"}</span>
                    <Badge variant="outline">{c.chatType === "p2p" ? "私聊" : "群"}</Badge>
                  </div>
                  <div className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">{c.chatId}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox checked={c.allowed} onCheckedChange={(v) => void toggleChat(c.id, v === true)} />
                    允许
                  </label>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    title="移除会话"
                    onClick={() => void deleteChat(c.id, c.name)}
                  >
                    <Trash2 className="size-3 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
