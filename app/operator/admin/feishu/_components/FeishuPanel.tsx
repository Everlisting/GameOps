"use client";

/**
 * 飞书 webhook 管理面板:新增 / 列表(启用·日报开关、测试、发日报、编辑、删除)。
 * URL / 加签密钥仅提交,不回显明文(列表只回打码串)。
 */
import * as React from "react";
import Link from "next/link";
import { Loader2, Send, Beaker, Pencil, Trash2, Plus, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

interface Webhook {
  id: string;
  name: string;
  urlMask: string;
  hasSecret: boolean;
  enabled: boolean;
  dailyReport: boolean;
  createdAt: string;
}

type Flash = { kind: "ok" | "err"; text: string } | null;

export function FeishuPanel() {
  const [items, setItems] = React.useState<Webhook[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [flash, setFlash] = React.useState<Flash>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // 新增表单
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [secret, setSecret] = React.useState("");
  const [daily, setDaily] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);

  // 编辑弹窗
  const [editing, setEditing] = React.useState<Webhook | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/operator/admin/feishu", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { webhooks: Webhook[] };
        setItems(data.webhooks ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!name.trim() || !url.trim()) {
      setFlash({ kind: "err", text: "名称和 webhook 地址必填" });
      return;
    }
    setAdding(true);
    setFlash(null);
    try {
      const res = await fetch("/api/operator/admin/feishu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          secret: secret.trim() || undefined,
          dailyReport: daily,
        }),
      });
      if (res.ok) {
        setName("");
        setUrl("");
        setSecret("");
        setDaily(false);
        setAddOpen(false);
        setFlash({ kind: "ok", text: "已添加" });
        void load();
      } else {
        const e = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setFlash({ kind: "err", text: e?.error?.message ?? "添加失败" });
      }
    } finally {
      setAdding(false);
    }
  }

  async function patch(id: string, data: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/operator/admin/feishu/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) void load();
      else {
        const e = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setFlash({ kind: "err", text: e?.error?.message ?? "更新失败" });
      }
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("确认删除该飞书群配置?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/operator/admin/feishu/${id}`, { method: "DELETE" });
      if (res.ok) {
        setFlash({ kind: "ok", text: "已删除" });
        void load();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function action(id: string, kind: "test" | "send") {
    setBusyId(id);
    setFlash(null);
    try {
      const res = await fetch(`/api/operator/admin/feishu/${id}/${kind}`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; msg?: string } | null;
      const label = kind === "test" ? "测试消息" : "日报";
      if (data?.ok) setFlash({ kind: "ok", text: `${label}已发送` });
      else setFlash({ kind: "err", text: `${label}发送失败:${data?.msg ?? "未知错误"}` });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {flash && (
        <Badge variant={flash.kind === "ok" ? "success" : "destructive"} className="w-fit" role="status">
          {flash.text}
        </Badge>
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>推送群</CardTitle>
            <CardDescription>
              {loading ? "正在读取配置…" : `已配置 ${items.length} 个群，可分别控制启用与日报推送。`}
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/operator/admin/feishu/report">
                <SlidersHorizontal data-icon="inline-start" />
                日报配置
              </Link>
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus data-icon="inline-start" />
              新增群
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              还没有配置飞书群，点击右上角「新增群」开始。
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((w) => (
                <div key={w.id} className="rounded-lg border p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{w.name}</span>
                        <Badge variant={w.enabled ? "success" : "muted"}>{w.enabled ? "启用" : "停用"}</Badge>
                        {w.hasSecret && <Badge variant="secondary">加签</Badge>}
                        {w.dailyReport && <Badge variant="warning">日报</Badge>}
                      </div>
                      <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{w.urlMask}</div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5 lg:justify-end">
                      <Button size="xs" variant="outline" onClick={() => action(w.id, "test")} disabled={busyId === w.id}>
                        <Beaker data-icon="inline-start" />
                        测试
                      </Button>
                      <Button size="xs" variant="outline" onClick={() => action(w.id, "send")} disabled={busyId === w.id}>
                        <Send data-icon="inline-start" />
                        发日报
                      </Button>
                      <Button size="icon-xs" variant="ghost" aria-label={`编辑 ${w.name}`} onClick={() => setEditing(w)}>
                        <Pencil />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`删除 ${w.name}`}
                        onClick={() => remove(w.id)}
                        disabled={busyId === w.id}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4">
                    <Field orientation="horizontal" className="w-auto">
                      <Checkbox
                        id={`webhook-enabled-${w.id}`}
                        checked={w.enabled}
                        onCheckedChange={(v) => patch(w.id, { enabled: v === true })}
                        disabled={busyId === w.id}
                      />
                      <FieldLabel htmlFor={`webhook-enabled-${w.id}`}>启用</FieldLabel>
                    </Field>
                    <Field orientation="horizontal" className="w-auto">
                      <Checkbox
                        id={`webhook-daily-${w.id}`}
                        checked={w.dailyReport}
                        onCheckedChange={(v) => patch(w.id, { dailyReport: v === true })}
                        disabled={busyId === w.id}
                      />
                      <FieldLabel htmlFor={`webhook-daily-${w.id}`}>每日日报</FieldLabel>
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增飞书群</DialogTitle>
            <DialogDescription>配置群机器人 Webhook；加签密钥只会加密保存，不会回显明文。</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="feishu-group-name">群名称 / 用途标签</FieldLabel>
              <Input id="feishu-group-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="feishu-webhook-url">Webhook 地址</FieldLabel>
              <Input
                id="feishu-webhook-url"
                placeholder="https://open.feishu.cn/…/hook/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="feishu-webhook-secret">加签密钥（可选）</FieldLabel>
              <Input id="feishu-webhook-secret" value={secret} onChange={(e) => setSecret(e.target.value)} />
            </Field>
            <Field orientation="horizontal">
              <Checkbox id="feishu-daily-report" checked={daily} onCheckedChange={(v) => setDaily(v === true)} />
              <FieldLabel htmlFor="feishu-daily-report">纳入每日 09:00 日报推送</FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={add} disabled={adding}>
              {adding ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Plus data-icon="inline-start" />}
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editing && (
        <EditDialog
          webhook={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setFlash({ kind: "ok", text: "已保存" });
            void load();
          }}
        />
      )}
    </div>
  );
}

function EditDialog({
  webhook,
  onClose,
  onSaved,
}: {
  webhook: Webhook;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(webhook.name);
  const [url, setUrl] = React.useState("");
  const [secret, setSecret] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    const body: Record<string, unknown> = {};
    if (name.trim() && name.trim() !== webhook.name) body.name = name.trim();
    if (url.trim()) body.url = url.trim();
    if (secret.trim()) body.secret = secret.trim();
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    try {
      const res = await fetch(`/api/operator/admin/feishu/${webhook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) onSaved();
      else {
        const e = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setErr(e?.error?.message ?? "保存失败");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑「{webhook.name}」</DialogTitle>
          <DialogDescription>Webhook 地址或密钥留空时会保留当前配置。</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="edit-feishu-name">群名称</FieldLabel>
            <Input id="edit-feishu-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-feishu-url">Webhook 地址</FieldLabel>
            <Input
              id="edit-feishu-url"
              placeholder={`留空不改，当前 ${webhook.urlMask}`}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-feishu-secret">加签密钥</FieldLabel>
            <Input
              id="edit-feishu-secret"
              placeholder={webhook.hasSecret ? "留空不改" : "可选"}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </Field>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 data-icon="inline-start" className="animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
