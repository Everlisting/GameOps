"use client";

/**
 * 新建爬虫机器:提交后端 → 把回显的 token 弹给管理员看一次。
 * 关掉弹窗才跳详情页(防止管理员还没复制就被刷掉)。
 *
 * 重构后:不再录入 capabilities,任务通过 Job 显式绑定。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import TokenReveal from "./TokenReveal";

export default function AgentCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [revealOpen, setRevealOpen] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [newAgentId, setNewAgentId] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.error?.details
          ? Object.values(data.error.details).flat().join(";")
          : "";
        setError(detail || data?.error?.message || "创建失败");
        return;
      }
      setNewAgentId(data.id);
      setRevealedToken(data.token);
      setRevealOpen(true);
    } catch {
      setError("网络错误,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Card className="space-y-4 p-5">
        <div className="grid gap-4">
          <div>
            <Label htmlFor="ag-name" className="mb-1.5 block text-xs">
              机器名 *
            </Label>
            <Input
              id="ag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如:local-win-01"
              autoComplete="off"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              用作识别符 + 日志展示;全局唯一。
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitting}>
            取消
          </Button>
          <Button onClick={submit} disabled={submitting || !name}>
            {submitting ? "创建中…" : "创建机器"}
          </Button>
        </div>
      </Card>

      <TokenReveal
        open={revealOpen}
        token={revealedToken}
        agentName={name}
        onClose={() => {
          setRevealOpen(false);
          if (newAgentId) router.push(`/operator/admin/agents/${newAgentId}`);
        }}
      />
    </>
  );
}
