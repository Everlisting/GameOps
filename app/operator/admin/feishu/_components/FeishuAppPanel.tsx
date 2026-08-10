"use client";

/**
 * 飞书双向对话配置:自建应用凭证 + 事件回调地址 + 会话白名单。
 * 密钥仅提交不回显(只回打码/是否已配);会话由入站消息自动登记,勾选 allowed 才应答。
 */
import * as React from "react";
import { ChevronDown, Loader2, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

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
    <div className="flex flex-col gap-4">
      {/* 长连接说明 */}
      <Collapsible className="group">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <CardTitle>长连接模式（WebSocket）</CardTitle>
              <CardDescription>无需公网回调地址或内网穿透，本地开发环境也能接收消息。</CardDescription>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="xs">
                配置步骤
                <ChevronDown data-icon="inline-end" className="transition-transform group-data-[state=open]:rotate-180" />
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <ol className="flex list-decimal flex-col gap-2 pl-4 text-sm text-muted-foreground">
                <li>填写 App ID 和 App Secret，勾选启用后保存；中台会先验证并热切换连接。</li>
                <li>
                  在飞书开放平台「事件与回调 → 事件配置」选择「使用长连接接收事件」，订阅{" "}
                  <code className="font-mono">im.message.receive_v1</code> 后保存。
                </li>
              </ol>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* 应用凭证 */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>自建应用凭证</CardTitle>
            <CardDescription>密钥只会加密保存，留空即保留当前值。</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
        {connection?.lastError && (
          <p className="text-xs text-destructive">{connection.lastError}</p>
        )}
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="feishu-app-id">App ID</FieldLabel>
              <Input id="feishu-app-id" value={appId} onChange={(e) => setAppId(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="feishu-app-secret">App Secret</FieldLabel>
              <Input
                id="feishu-app-secret"
                placeholder={app?.appSecretMask ? `留空不改，当前 ${app.appSecretMask}` : "请输入 App Secret"}
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <Field orientation="horizontal">
            <Checkbox id="feishu-app-enabled" checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
            <FieldLabel htmlFor="feishu-app-enabled">启用双向对话（关闭后不处理入站消息）</FieldLabel>
          </Field>
        </CardContent>
        <CardFooter className="gap-3">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 data-icon="inline-start" className="animate-spin" />}
            保存
          </Button>
          {flash && (
            <Badge variant={flash.kind === "ok" ? "success" : "destructive"} role="status">
              {flash.text}
            </Badge>
          )}
        </CardFooter>
      </Card>

      {/* 会话白名单 */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>会话白名单</CardTitle>
            <CardDescription>
              机器人收到一次 @消息后会发现该会话；只有允许的会话才会应答。
            </CardDescription>
          </div>
          <Button size="xs" variant="ghost" onClick={() => void load()}>
            <RefreshCw data-icon="inline-start" />
            刷新
          </Button>
        </CardHeader>
        <CardContent>
          {chats.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              还没有会话。把机器人加入群并 @它发送消息，然后点击「刷新」。
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {chats.map((c) => (
                <div key={c.id} className="flex flex-col gap-3 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="truncate font-medium">{c.name || "（未命名会话）"}</span>
                      <Badge variant="outline">{c.chatType === "p2p" ? "私聊" : "群"}</Badge>
                    </div>
                    <div className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">{c.chatId}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Field orientation="horizontal" className="w-auto">
                      <Checkbox
                        id={`feishu-chat-${c.id}`}
                        checked={c.allowed}
                        onCheckedChange={(v) => void toggleChat(c.id, v === true)}
                      />
                      <FieldLabel htmlFor={`feishu-chat-${c.id}`}>允许</FieldLabel>
                    </Field>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`移除 ${c.name || "未命名会话"}`}
                      onClick={() => void deleteChat(c.id, c.name)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
