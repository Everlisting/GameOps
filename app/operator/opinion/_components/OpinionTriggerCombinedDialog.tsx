"use client";

/**
 * 对比报告触发对话框:从已完成的私域 / 公域列表里各选一份,POST 触发。
 *
 * 加载策略:打开对话框时才拉列表(避免首次进列表页无谓请求)。
 * 默认选中各自最新的 DONE。
 */
import { useCallback, useEffect, useState } from "react";
import { GitCompare } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

import type { OpinionTaskItem } from "./OpinionTaskTable";

function fmtLabel(t: OpinionTaskItem): string {
  const date = new Date(t.created_at).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const span = t.coverage_span ? ` · ${t.coverage_span}` : "";
  return `${date}${span} · ${t.game}`;
}

export function OpinionTriggerCombinedDialog({
  configured,
  onCreated,
}: {
  configured: boolean;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [priv, setPriv] = useState<OpinionTaskItem[]>([]);
  const [pub, setPub] = useState<OpinionTaskItem[]>([]);
  const [privateId, setPrivateId] = useState<string>("");
  const [publicId, setPublicId] = useState<string>("");
  const [game, setGame] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [pR, uR] = await Promise.all([
        fetch("/api/opinion/tasks?scope=private&status=DONE&limit=100", { cache: "no-store" }),
        fetch("/api/opinion/tasks?scope=public&status=DONE&limit=100", { cache: "no-store" }),
      ]);
      const pB = pR.ok ? ((await pR.json()) as { items: OpinionTaskItem[] }) : { items: [] };
      const uB = uR.ok ? ((await uR.json()) as { items: OpinionTaskItem[] }) : { items: [] };
      setPriv(pB.items);
      setPub(uB.items);
      if (pB.items[0]) setPrivateId(pB.items[0].task_id);
      if (uB.items[0]) setPublicId(uB.items[0].task_id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "网络错误");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function submit() {
    if (!privateId || !publicId) {
      setErr("请选择两份已完成的报告");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/opinion/tasks/combined", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privateTaskId: privateId,
          publicTaskId: publicId,
          game: game.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErr(b?.error?.message ?? `触发失败(${res.status})`);
        return;
      }
      setOpen(false);
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "网络错误");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        onClick={() => setOpen(true)}
        disabled={!configured}
        title={configured ? undefined : "请先在「模型设置」里配置 LLM"}
      >
        <GitCompare className="size-4" />
        生成对比报告
      </Button>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>生成对比报告</DialogTitle>
          <DialogDescription>
            从已完成的私域 + 公域报告里各选一份,分析服务会读它们固化的 JSON 做叠加解读。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block text-xs">私域报告 *</Label>
            <Select value={privateId} onValueChange={setPrivateId} disabled={loading || submitting}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "加载中…" : "请选择"} />
              </SelectTrigger>
              <SelectContent>
                {priv.length === 0 && (
                  <div className="px-2 py-3 text-xs text-muted-foreground">
                    还没有已完成的私域报告
                  </div>
                )}
                {priv.map((t) => (
                  <SelectItem key={t.task_id} value={t.task_id}>
                    {fmtLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs">公域报告 *</Label>
            <Select value={publicId} onValueChange={setPublicId} disabled={loading || submitting}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "加载中…" : "请选择"} />
              </SelectTrigger>
              <SelectContent>
                {pub.length === 0 && (
                  <div className="px-2 py-3 text-xs text-muted-foreground">
                    还没有已完成的公域报告
                  </div>
                )}
                {pub.map((t) => (
                  <SelectItem key={t.task_id} value={t.task_id}>
                    {fmtLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="opn-cg" className="mb-1.5 block text-xs">
              游戏(可选,留空沿用私域)
            </Label>
            <Input
              id="opn-cg"
              value={game}
              onChange={(e) => setGame(e.target.value)}
              disabled={submitting}
              placeholder="率土之滨"
            />
          </div>

          {err && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {err}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            取消
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !privateId || !publicId || loading}
          >
            {submitting ? "触发中…" : "开始生成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
