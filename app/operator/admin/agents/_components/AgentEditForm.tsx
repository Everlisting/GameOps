"use client";

/**
 * 爬虫机器编辑:改 name / status + 重置 token + 删除。
 * 重构后:删 capabilities 字段;任务通过 Job 显式绑定。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

import TokenReveal from "./TokenReveal";

export type AgentEditInitial = {
  id: string;
  name: string;
  status: "ACTIVE" | "DISABLED";
};

export default function AgentEditForm({
  initial,
}: {
  initial: AgentEditInitial;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [status, setStatus] = useState<AgentEditInitial["status"]>(initial.status);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = name !== initial.name || status !== initial.status;

  async function save() {
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {};
      if (name !== initial.name) body.name = name;
      if (status !== initial.status) body.status = status;
      const res = await fetch(`/api/admin/agents/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.error?.details
          ? Object.values(data.error.details).flat().join(";")
          : "";
        setError(detail || data?.error?.message || "保存失败");
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch {
      setError("网络错误,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  // ── rotate token ──
  const [rotateOpen, setRotateOpen] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  async function rotate() {
    setRotateOpen(false);
    setError(null);
    try {
      const res = await fetch(`/api/admin/agents/${initial.id}/rotate-token`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "重置失败");
        return;
      }
      setRevealedToken(data.token);
    } catch {
      setError("网络错误,请重试");
    }
  }

  // ── delete ──
  const [delOpen, setDelOpen] = useState(false);
  async function destroy() {
    setDelOpen(false);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/agents/${initial.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.message ?? "删除失败");
        return;
      }
      router.push("/operator/admin/agents");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-medium">基础信息</h2>
          <div>
            <Label htmlFor="ag-name" className="mb-1.5 block text-xs">机器名 *</Label>
            <Input id="ag-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ag-status" className="mb-1.5 block text-xs">状态</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as AgentEditInitial["status"])}
            >
              <SelectTrigger id="ag-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">启用</SelectItem>
                <SelectItem value="DISABLED">停用</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              停用后,该 agent 的所有 API 请求返回 403;在跑的任务不会被打断。
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <span className="text-xs text-muted-foreground">
              {savedAt && Date.now() - savedAt < 4000 ? "已保存" : ""}
            </span>
            <Button onClick={save} disabled={submitting || !dirty}>
              {submitting ? "保存中…" : "保存"}
            </Button>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-medium">Token</h2>
          <p className="text-xs text-muted-foreground">
            服务端只保留 token 哈希,无法找回原文。如果 agent 端 token 丢失或泄露,在这里重置,然后立刻让 agent 用新 token 接入。
          </p>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setRotateOpen(true)} disabled={submitting}>
              <RefreshCw className="size-3.5" />
              重置 Token
            </Button>
          </div>
        </Card>

        <Card className="space-y-3 border-destructive/30 p-5 lg:col-span-2">
          <h2 className="text-sm font-medium text-destructive">危险操作</h2>
          <p className="text-xs text-muted-foreground">
            删除 agent 后该 token 立刻失效。已完成的任务历史不会受影响(FK 是 SetNull)。
            有绑定的 Job 或 RUNNING 任务时会被拒绝,需要先迁移 / 取消。
          </p>
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => setDelOpen(true)}
              disabled={submitting}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
              删除机器
            </Button>
          </div>
        </Card>
      </div>

      <AlertDialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-amber-500" />
              确认重置 Token?
            </AlertDialogTitle>
            <AlertDialogDescription>
              重置后旧 token 立即失效。agent 端必须用新 token 才能继续接任务。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={rotate}>确认重置</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除机器 {initial.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              不可恢复。如果只是临时不用,建议改为「停用」。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={destroy}
              className={cn(
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              )}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TokenReveal
        open={revealedToken !== null}
        token={revealedToken}
        agentName={initial.name}
        onClose={() => setRevealedToken(null)}
      />
    </>
  );
}
