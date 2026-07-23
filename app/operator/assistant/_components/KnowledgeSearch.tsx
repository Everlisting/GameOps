"use client";

/**
 * 知识库检索页(OPERATOR):输入检索词,查看命中的片段 + 来源文档 + 相似度。尊重 per-KB 权限。
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Hit {
  chunkId: string;
  content: string;
  documentId: string;
  title: string;
  kbName: string;
  score: number;
}

export function KnowledgeSearch({
  endpoint = "/api/operator/knowledge/search",
}: {
  endpoint?: string;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    const query = q.trim();
    if (!query || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        hits?: Hit[];
        error?: { message?: string };
      };
      if (!res.ok) {
        setErr(d?.error?.message || "检索失败(检查 embedding 模型配置)");
        setHits([]);
      } else {
        setHits(d.hits ?? []);
      }
      setSearched(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "网络错误");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
          placeholder="输入检索词,如「活动投稿有什么规范」"
          className="max-w-xl"
        />
        <Button onClick={() => void run()} disabled={busy || !q.trim()}>
          {busy ? "检索中…" : "检索"}
        </Button>
      </div>

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </div>
      )}

      {searched && !err && hits.length === 0 && (
        <p className="text-sm text-muted-foreground">无命中(知识库为空、无权访问,或没有相关内容)。</p>
      )}

      <div className="space-y-3">
        {hits.map((h) => (
          <div key={h.chunkId} className="rounded-lg border bg-background p-3">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{h.title}</span>
              <span className="rounded-full bg-muted px-2 py-0.5">{h.kbName}</span>
              <span className="ml-auto font-mono tabular-nums">相似度 {h.score.toFixed(3)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{h.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
